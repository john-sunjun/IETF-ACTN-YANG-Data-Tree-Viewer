// schema node: A node in the schema tree. Including followings
// data nodes: container, leaf, leaf-list, list, choice, case 
// operations: action, rpc, input, output, notification

// use: expands local data node using grouping with local namespace
// augment: expands target data node with local namespace
// identity and typedef: need to be resolved via base and type
const Parser = require('./parser')
class Schema {
    constructor(ast) {
        this.root = { $biTypeMap: new Map(), $idTypeMap: new Map() }
        tree(ast, this.root)
        doAugment(this.root)
        collectRpc(this.root)
        return this.root
    }
    static getNodeByPath(dst, path) {
        let temp = dst
        for (let e of path.split("/")) {
            if (!e) continue
            if (!temp || !(temp = temp[e])) return
        }
        return temp;
    }
}
module.exports = Schema

const AST_NODE_FUNC = new Map([
    ['module', Module],
    ['container', container],
    ['leaf', leaf],
    ['leaf-list', leaf],
    ['list', container],
    ['choice', container],
    ['case', container],
    ['rpc', container],
    ['input', container],
    ['output', container],
    ['notification', container],
    ['action', container],
    ['uses', usesGrouping],
])
const BUILT_IN_TYPE = new Set([
    "int8", "int16", "int32", "int64",
    "uint8", "uint16", "uint32", "uint64",
    "binary", "bits", "boolean", "decimal64",
    "string", "enumeration", "union", "empty",
    "identityref", "instance-identifier", "leafref",
])

function tree(ast, dst) {
    Object.keys(ast).forEach(type => {
        var func = AST_NODE_FUNC.get(type)
        if (!func) return
        if (Array.isArray(ast[type])) {
            ast[type].forEach(each => func(each, dst, type))
        }
        else if (typeof ast[type] === 'object') {
            func(ast[type], dst, type)
        }
    })
}

function leaf(ast, dst, type) {
    var node = newNode(ast, dst, type)
    node.leafType = getLeafType(ast, node, dst.$module.$id)
}

function Module(ast, dst, type) {
    var node = newNode(ast, dst, type)
    node.$module = node
    node.$id = ast.argument
    node.$root = dst
    tree(ast, node)
    if (ast.augment) {
        node.$augment = { $module: node, $ast: ast }
        ast.augment.forEach(aug => augment(aug, node.$augment))
    }
}

function container(ast, dst, type) {
    var node = newNode(ast, dst, type)
    tree(ast, node)
}

// just replace the uses ast node with grouping ast node
// then augment it if there's any augment substatement
function usesGrouping(ast, dst) {
    var grouping = Parser.getNodeRef(ast, 'grouping')
    tree(grouping, dst)
    if (ast.augment) {
        ast.augment.forEach(aug => {
            var target = Schema.getNodeByPath(dst, aug.argument)
            if (target && typeof target == 'object')
                tree(aug, target)
        })
    }
}

function newNode(ast, dst, type, name) {
    // Check if it is a duplicate node
    if (!name) name = ast.argument || type
    if (dst[name]) {
        Parser.error(ast, `'${type}' name is a duplicate of line ${dst[name].$ast.$line}`)
    }

    let node = {
        $module: dst.$module,
        $ast: ast,
        _config: getConfig(ast, dst),
        _type: type,
    }
    let mandatory = getMandatory(ast, dst, type)
    if (mandatory) node._mandatory = mandatory
    let key = Parser.getNodeChild(ast, 'key', false)
    if (key) node._key = key
    return dst[name] = node
}

function getConfig(ast, dst) {
    if (ast.config && dst._config === true) {
        switch (ast.config.argument) {
            case 'true': return true
            case 'false': return false
        }
    }
    return dst._config === undefined ? true : dst._config
}

function getMandatory(ast, dst, type) {
    if (/^(leaf|choice)$/.test(type)) {
        let mandatory = Parser.getNodeChild(ast, 'mandatory', false) == 'true'
        if (type == 'leaf' && dst._key && dst._key.indexOf(ast.argument) >= 0) {
            mandatory = true
        }
        return mandatory
    }
}

// find the base type for identiryref, typedef and 
// path for leafref, add necessary full module name
function getLeafType(node, dst, curModuleId) {
    let [typeAst, type] = Parser.getNodeChild0(node, 'type')
    let base, refNode
    if (BUILT_IN_TYPE.has(type)) {
        if (type == 'identityref') {
            [, base] = Parser.getNodeChild0(node.type[0], 'base')
            refNode = Parser.getNodeRef(node.type[0].base[0], 'identity');
            [base, curModuleId] = replaceModuleId(base, refNode, curModuleId)
            // add index referrence to indentity
            dst.$idTypeIndex = addNodeToMap(dst.$module.$root.$idTypeMap, refNode)
            if (refNode.child) {
                base += `[${refNode.child.length}]`
            }
        } else if (type == 'leafref') {
            base = Parser.getNodeChild(node.type[0], 'path')
        } else {
            // add index referrence to customized built-in type ast
            if (Parser.hasChildren(typeAst)) {
                dst.$biTypeIndex = addNodeToMap(dst.$module.$root.$biTypeMap, typeAst)
                type += '*'
            }
        }
    } else {
        refNode = Parser.getNodeRef(node.type[0], 'typedef');
        [type, curModuleId] = replaceModuleId(type, refNode, curModuleId)
        base = getLeafType(refNode, dst, curModuleId)
    }
    return base ? `${type}(${base})` : type

    function addNodeToMap(nodeMap, node) {
        let value = nodeMap.get(node)
        if (value === undefined) {
            value = nodeMap.size
            nodeMap.set(node, value)
        }
        return value
    }
}

// add module prefix if ast and dst belong to different modules
function replaceModuleId(name, ast, curModuleId) {
    var strs = name.split(':')
    var baseName = (strs.length == 2) ? strs[1] : strs[0]
    var moduleId = Parser.getModuleId(ast)
    return [(moduleId == curModuleId ? '' : moduleId + ':') + baseName, moduleId]
}

// change the augment ast path to dst path
// /nw:aaa/nw:bbb/nt:ccc/nt:ddd  =>  aaa/bbb/net-topo:ccc/ddd
function augment(ast, dst) {
    var parts = ast.argument.split('/')
    parts.shift()
    var [lastPrefix, base] = Parser.getSplitId(parts[0])
    parts[0] = base
    var augModId = Parser.getModuleIdByPrefix(ast, lastPrefix)
    for (let i = 1; i < parts.length; i++) {
        let [prefix, base] = Parser.getSplitId(parts[i])
        if (prefix == lastPrefix) parts[i] = base
        else {
            parts[i] = (prefix ? Parser.getModuleIdByPrefix(ast, prefix) :
                Parser.getModuleId(ast)) + ':' + base
            lastPrefix = prefix
        }
    }
    var node = newNode(ast, dst, 'augment', parts.join('/'))
    node.$augModId = augModId
    tree(ast, node)
}

// 1 generate a sub dst locally same as container
// 2 find the target node in the globle dst
// 3 copy the sub dst to the target node
// 4 repeat 2&3 until no more augmentation can be done
// The target node MUST be either a container, list, 
// choice, case, input, output or notification node
function doAugment(root) {
    while (doOnce(root, false)) { }
    doOnce(root, true)

    function doOnce(root, isFinal) {
        var isAuged = false
        Object.keys(root).forEach(module => {
            if (module[0] == '$') return
            var augs = root[module].$augment
            if (!augs) return
            Object.keys(augs).forEach(augPath => {
                if (augPath[0] == '$') return
                var aug = augs[augPath]
                var target = Schema.getNodeByPath(root[aug.$augModId], augPath)
                if (!target) {
                    if (!isFinal) return
                    Parser.error(aug.$ast, 'Augment target not found')
                }
                Object.keys(aug).forEach(one => {
                    if (one[0] == '$' || one[0] == '_') return
                    // copy to the same namespace without prefix
                    // otherwise (to different namespace) add its own prefix
                    var moduleId = augs.$module.$id
                    if (target.$module.$id == moduleId) moduleId = ''
                    else moduleId += ':'
                    target[moduleId + one] = aug[one]
                    // Dealing with 'choice/case' statement whose child nodes 
                    // should have the same prefix as that of the 'choice/case'
                    if (aug[one]._type == 'case') {
                        addModulePrefixForCase(aug[one], moduleId)
                    }
                    else if (aug[one]._type == 'choice') {
                        Object.keys(aug[one]).forEach(child => {
                            if (aug[one][child]._type == 'case')
                                addModulePrefixForCase(aug[one][child], moduleId)
                        })
                    }
                })
                delete augs[augPath]; isAuged = true
                // Set the config false if target is not configurable
                if (target._config === false) disableConfig(aug)
            })
        })
        return isAuged

        function addModulePrefixForCase(node, moduleId) {
            Object.keys(node).forEach(child => {
                if (child[0] == '$' || child[0] == '_') return
                node[moduleId + child] = node[child]
                delete node[child]
            })
        }
    }
}

// move all rpcs into $rpc
function collectRpc(root) {
    Object.keys(root).forEach(module => {
        let mod = root[module]
        Object.keys(mod).forEach(node => {
            if (mod[node]._type == 'rpc') {
                if (!mod.$rpc) mod.$rpc = {}
                mod.$rpc[node] = mod[node]
                delete mod[node]
            }
        })
    })
}

function disableConfig(dst) {
    dst._config = false
    Object.keys(dst).forEach(k => {
        if (k[0] == '$' || k[0] == '_') return
        if (/^(leaf|leaf-list)$/.test(dst[k]._type)) {
            dst[k]._config = false
        } else {
            disableConfig(dst[k])
        }
    })
}
