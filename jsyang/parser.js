const fs = require('fs')

// Yang parser
// statement = keyword [argument] (; | {*substatement})
const YANG_STATEMENTS = new Map([
    ['module', { argType: 'identifier', sibling: true }],
    ['yang-version', { argType: 'version', sibling: false }],
    ['namespace', { argType: 'string', sibling: false }],
    ['contact', { argType: 'string', sibling: false }],
    ['organization', { argType: 'string', sibling: false }],
    ['prefix', { argType: 'identifier', sibling: false }],
    ['import', { argType: 'identifier', sibling: true }],
    ['revision', { argType: 'date', sibling: true }],
    ['revision-date', { argType: 'date', sibling: false }],

    ['typedef', { argType: 'identifier', sibling: true }],
    ['units', { argType: 'phrase', sibling: false }],
    ['default', { argType: 'phrase', sibling: false }],

    ['type', { argType: 'node-id', sibling: true }],
    ['bit', { argType: 'identifier', sibling: true }],
    ['position', { argType: 'number', sibling: false }],
    ['enum', { argType: 'phrase', sibling: true }],
    ['value', { argType: 'number', sibling: false }],
    ['fraction-digits', { argType: 'number', sibling: false }],
    ['length', { argType: 'phrase', sibling: false }],
    ['path', { argType: 'ref-path', sibling: false }],
    ['pattern', { argType: 'string', sibling: true }],
    ['range', { argType: 'string', sibling: false }],
    ['require-instance', { argType: 'bool', sibling: false }],

    ['identity', { argType: 'identifier', sibling: true }],
    ['base', { argType: 'node-id', sibling: true }],

    ['container', { argType: 'identifier', sibling: true }],
    ['must', { argType: 'string', sibling: true }],
    ['error-app-tag', { argType: 'string', sibling: false }],
    ['error-message', { argType: 'string', sibling: false }],
    ['presence', { argType: 'string', sibling: false }],
    ['leaf', { argType: 'identifier', sibling: true }],
    ['mandatory', { argType: 'bool', sibling: false }],
    ['leaf-list', { argType: 'identifier', sibling: true }],
    ['min-elements', { argType: 'number', sibling: false }],
    ['max-elements', { argType: 'number', sibling: false }],
    ['ordered-by', { argType: 'order-by', sibling: false }],
    ['list', { argType: 'identifier', sibling: true }],
    ['key', { argType: 'phrase', sibling: false }],
    ['unique', { argType: 'string', sibling: true }],
    ['choice', { argType: 'identifier', sibling: true }],
    ['case', { argType: 'identifier', sibling: true }],
    ['uses', { argType: 'node-id', sibling: true }],
    ['refine', { argType: 'node-path', sibling: true }],

    ['grouping', { argType: 'identifier', sibling: true }],

    ['augment', { argType: 'node-path', sibling: true }],
    ['feature', { argType: 'identifier', sibling: true }],
    ['if-feature', { argType: 'node-id', sibling: false }],

    ['rpc', { argType: 'identifier', sibling: true }],
    ['input', { argType: 'none', sibling: false }],
    ['output', { argType: 'none', sibling: false }],
    ['action', { argType: 'identifier', sibling: true }],
    ['notification', { argType: 'identifier', sibling: true }],

    ['status', { argType: 'string', sibling: false }],
    ['config', { argType: 'bool', sibling: false }],
    ['description', { argType: 'string', sibling: false }],
    ['reference', { argType: 'string', sibling: false }],
    ['when', { argType: 'string', sibling: false }],
])

const RE_ID = `[a-zA-Z][\\w-\\.]*`
const RE_NID = `(${RE_ID}:)?${RE_ID}`
const RE_NPATH = `/?${RE_NID}(/${RE_NID})*`
const RE_RPATH_KEY = `current\\s*\\(\\s*\\)\\s*(/\\.\\.)+(/${RE_NID}\\s*)*`
const RE_RPATH_ONE = `${RE_NID}(\\[\\s*${RE_NID}\\s*=\\s*${RE_RPATH_KEY}\\s*\\])*`
const RE_RPATH = `(/?|(\\.\\./)*)${RE_RPATH_ONE}(/${RE_RPATH_ONE})*`
// yang argument regular expression map
const YANG_ARG_REGEX = new Map([
    ['none', ''],
    ['identifier', RE_ID],
    ['node-id', RE_NID],
    ['bool', 'true|false'],
    ['version', '\\d+(\\.\\d)*'],
    ['date', '\\d{4}-\\d{2}-\\d{2}'],
    ['number', '\\d+'],
    ['order-by', 'system|user'],
    ['phrase', '.*'],
    ['string', null],
    ['node-path', RE_NPATH],
    ['ref-path', RE_RPATH],
])
YANG_ARG_REGEX.forEach((v, k, m) => {
    m.set(k, RegExp(v !== null ? `^${v}$` : '.'))
})

class Parser {
    constructor(files) {
        this.root = {}
        for (this.file of files) {
            this.input = fs.readFileSync(this.file, 'utf-8')
            this.pos = 0, this.line = 1, this.col = 1
            this.parent = this.root
            this.readBlock()
        }
        if (!Array.isArray(this.root.module)) return null
        this.createRefMaps()
        this.checkImportedModules()
        this.linkIdentity()
        return this.root
    }

    next() {
        var ch = this.input.charAt(this.pos)
        if (ch) {
            this.pos++
            if (ch != "\n") this.col++
            else this.line++, this.col = 1
        }
        return ch
    }
    back() {
        this.pos--; this.col--
    }
    error(msg) {
        throw new Error(`${msg}: "${this.file}"(${this.line}:${this.col})`)
    }

    nextNonSpace() {
        var ch = ''
        while ((ch = this.next()) && ' \t\r\n'.indexOf(ch) >= 0) { }
        return ch
    }

    skipAfter(end) {
        while (this.next()) {
            var str = this.input.substr(this.pos - 1, end.length)
            if (str == end) {
                let i = end.length
                while (i-- > 1) this.next()
                break
            }
        }
    }

    readWord() {
        var ch, startPos = this.pos
        while ((ch = this.next()) && ' \t\r\n;{'.indexOf(ch) < 0) { }
        var endPos = this.pos - (ch ? 1 : 0)
        if (ch == ';' || ch == '{') this.back()
        return this.input.slice(startPos, endPos)
    }

    readArgument() {
        var ch, arg = '', quote = false
        while (ch = this.nextNonSpace()) {
            if (ch == '"' || ch == "'") {
                var startPos = this.pos, esc = false
                if (ch == "'") {
                    this.skipAfter("'")
                } else {
                    while ((ch = this.next()) && (esc || ch != '"')) {
                        esc = (ch == '\\') ? !esc : false
                    }
                }
                arg += this.input.slice(startPos, this.pos - 1)
                quote = true; continue
            }
            else if (quote && ch == '+') continue
            else { this.back(); break }
        }
        return (quote || arg) ? arg : this.readWord()
    }

    // read a Yang block { }
    readBlock() {
        var ch
        while (ch = this.nextNonSpace()) {
            switch (ch) {
                case '/': {
                    switch (this.next()) {
                        case '/': this.skipAfter('\n'); break
                        case '*': this.skipAfter('*/'); break
                        default: this.error('/ or * is expected')
                    }
                    break
                }
                case '}': {
                    if (this.parent == this.root) this.error('Unexpected }')
                    else { this.parent = this.parent.$parent; return }
                }
                default: this.back(); this.readStatement()
            }
        }
        if (this.parent != this.root) this.error('Block is not complete')
    }

    // read a Yang statement
    readStatement() {
        // read keyword
        var keyword = this.readWord()
        var sm = YANG_STATEMENTS.get(keyword)
        if (!sm) this.error(`keyword(${keyword}) is invalid`)

        // create a new node named by keyword
        var node = {
            $parent: this.parent, $module: this.parent.$module,
            $line: this.line, $col: this.col
        }
        if (keyword == 'module') {
            if (this.parent == this.root) {
                node.$file = this.file, node.$module = node
            } else {
                this.error(`module can't be child statement`)
            }
        }
        else if (this.parent == this.root) {
            this.error(`${keyword} can't be top statement`)
        }
        if (sm.sibling) {
            if (!(this.parent[keyword])) this.parent[keyword] = []
            this.parent[keyword].push(node)
        } else {
            this.parent[keyword] = node
        }

        // read argument
        node.argument = this.readArgument()
        if (!YANG_ARG_REGEX.get(sm.argType).test(node.argument)) {
            this.error(`${sm.argType}(${node.argument}) is invalid`)
        }

        // read end of statement or start of a new sub-block
        switch (this.nextNonSpace()) {
            case ';': this.readBlock(); break
            case '{': this.parent = node; this.readBlock(); break
            default: this.error('; or { is expected')
        }
    }

    createRefMaps() {
        createOne(this.root, 'module')
        this.root.module.forEach(module => {
            createOne(module, 'import')
            createOne(module, 'import', 'prefix')
            createOne(module, 'identity')
            createMany(module, ['grouping', 'typedef'])
        })

        function createMany(ast, keywords) {
            keywords.forEach(keyword => createOne(ast, keyword))
            Object.keys(ast).forEach(key => {
                if (key[0] == '$') return
                if (Array.isArray(ast[key])) {
                    ast[key].forEach(one => createMany(one, keywords))
                }
                else if ((typeof ast[key]) == 'object') {
                    createMany(ast[key], keywords)
                }
            })
        }

        function createOne(ast, keyword, subKey = '') {
            var map = new Map()
            ast[`$map_${subKey ? subKey : keyword}`] = map
            if (!Array.isArray(ast[keyword])) return
            ast[keyword].forEach(one => {
                var key = one.argument
                if (subKey) {
                    if (!one[subKey] || !one[subKey].argument)
                        Parser.error(one, `sub: ${subKey} is expected`)
                    key = one[subKey].argument
                }
                if (map.has(key))
                    Parser.error(one, `${keyword} name(${key}) conflicts`)
                map.set(key, one)
            })
        }
    }

    // Check if imported modules have been read and parsed
    checkImportedModules() {
        this.root.module.forEach(module => {
            if (!module.import) return
            module.import.forEach(one => {
                if (!this.root.$map_module.has(one.argument))
                    Parser.error(one, `Imported module(${one.argument}) not found`)                    
            })
        })
    }

    // link child identity to parent identity
    linkIdentity() {
        this.root.module.forEach(module => {
            if (!module.identity) return
            module.identity.forEach(id => {
                if (!id.base) return
                let refNode = Parser.getNodeRef(id.base[0], 'identity')
                if (refNode) {
                    if (refNode.child) refNode.child.push(id)
                    else refNode.child = [id]
                }
            })
        })
    }

    // get referrence node for current node.
    // refType: identityref/identity->identity, uses->grouping, type->typedef
    static getNodeRef(node, refType) {
        let refNode
        let [prefix, baseName] = Parser.getSplitId(node.argument)
        if (prefix == '' || prefix == Parser.getModulePrefix(node)) {
            let parent = node.$parent
            while (parent && !refNode) {
                refNode = getRefUnderNode(parent, baseName, refType)
                parent = parent.$parent
            }
        } else {
            let map_module = node.$module.$parent.$map_module
            let moduleId = Parser.getModuleIdByPrefix(node, prefix)
            if (!moduleId) Parser.error(node, `Module prefix ${prefix} not found`)
            let module = map_module.get(moduleId)
            if (module) refNode = getRefUnderNode(module, baseName, refType)
        }
        return refNode || Parser.error(node, `${refType}(${node.argument}) not found`)

        function getRefUnderNode(node, refId, refType) {
            var map_ref = node[`$map_${refType}`]
            if (map_ref instanceof Map) {
                return map_ref.get(refId)
            }
        }
    }

    static getNodeChild0(node, name) {
        if (node && Array.isArray(node[name]) && node[name].length >= 1) {
            return [node[name][0], node[name][0].argument]
        }
        Parser.error(node, `${name} is expected for ${node.argument}`)
    }

    static getNodeChild(node, name, must = true) {
        if (node[name]) return node[name].argument
        if (!must) return ''
        Parser.error(node, `${name} is expected for ${node.argument}`)
    }

    static getSplitId(nodeId) {
        var strs = nodeId.split(':')
        return (strs.length == 2) ? [strs[0], strs[1]] : ['', strs[0]]
    }

    static getModuleId(node) {
        return node.$module.argument
    }

    static getModuleIdByPrefix(node, prefix) {
        var importModule = node.$module.$map_prefix.get(prefix)
        if (importModule) return importModule.argument
        Parser.error(node, `prefix(${prefix}) not found`)
    }

    static getModulePrefix(node) {
        if (node.$module.prefix) return node.$module.prefix.argument
        Parser.error(node.$module, `prefix is expected`)
    }

    static error(node, msg) {
        throw new Error(`${msg}: "${node.$module.$file}"(${node.$line}:${node.$col})`)
    }

    static output(key, value) {
        var statements = [], i = 0
        outputOne(key, value, '')
        return statements.join('')

        function outputOne(key, value, indent) {
            if (Array.isArray(value)) {
                value.forEach(e => outputOne(key, e, indent))
            } else {
                statements[i++] = `${indent}${key}: '${value.argument}'`
                let j = i++
                Object.keys(value).forEach(k => {
                    if (k[0] == '$' || k == 'argument') return
                    outputOne(k, value[k], indent + '    ')
                })
                if (i > j + 1) {
                    statements[j] = ' {\n'
                    statements[i++] = `${indent}}\n`
                } else {
                    statements[j] = '\n'
                }
            }
        }
    }

    static hasChildren(ast) {
        let keys = Object.keys(ast)
        for (let i = 0; i < keys.length; i++) {
            if (keys[i][0] != '$' && keys[i] != 'argument') return true
        }
        return false
    }

}
module.exports = Parser