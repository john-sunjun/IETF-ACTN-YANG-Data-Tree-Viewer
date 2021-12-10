console.log(`jsyang is a tool that will scan all yang files in current directory
and generate JSON data and HTML files in "jsy-output" sub-directory.
Author: Jun Sun, @Huawei Canada. Version: 2021-10-10\n`)
const fs = require('fs')
const path = require('path')
const Parser = require('./parser')
const Schema = require('./schema')
const OUT_DIR = 'jsy-output'
const https = require('https')

try {
    const files = getYangFiles('./')
    // abstract syntax tree
    var ast = new Parser(files)
    if (!ast) return console.log('No valid yang files')
    // data schema tree
    var dst = new Schema(ast)
    // generate in JSON and HTML files
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)
    var outNum = yangToOthers(dst)
    console.log(`Input YANG files: ${files.length} | Output JSON/HTML files: ${outNum}/${outNum}`)

    const express = require('express')
    var app = express()
    app.use(express.static(__dirname))
    app.use(express.static('./'))
    app.listen(20210)
    const APP_LINK = 'http://127.0.0.1:20210/jsy-view.html'
    console.log("jsyang server is running at => " + APP_LINK)
    console.log("Hold Ctrl and click the left mouse key to show the complete tooltip.")
    const cp = require('child_process')
    cp.exec('start ' + APP_LINK)

    // if there's -u option then update the yang models to the latest version
    if (process.argv[2] == '-u') {
        downloadLatestYangFiles(dst)
    }
} catch (err) {
    console.log(err.stack)
    console.log('Press any key to exit')
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
}

function getYangFiles(dir, files = []) {
    fs.readdirSync(dir).forEach(file => {
        var filePath = path.join(dir, file)
        if (fs.statSync(filePath).isDirectory() && file != OUT_DIR) {
            getYangFiles(filePath, files)
        }
        else if (/^[A-Za-z].*\.yang$/.test(file)) {
            files.push(filePath)
        }
    })
    return files
}

function yangToOthers(dst) {
    let outNum = 0
    let indexHtmls = [], i = 0
    indexHtmls[i++] = '<ol id="yang">'
    Object.keys(dst).forEach(modName => {
        if (modName[0] == '$') return
        let ast = dst[modName].$ast
        let revision = ast.revision[0] ? ast.revision[0].argument : 'No revision'
        let prefix = ast.prefix ? ast.prefix.argument : 'No prefix'
        let description = ast.description ? ast.description.argument : 'No description'
        let fileName = `${modName}@${revision}`
        let rwro, rw, rpc
        rwro = moduleToOthers(fileName + '(rw+ro)', dst[modName])
        rw = moduleToOthers(fileName + '(rw)', dst[modName], true)
        rpc = moduleToOthers(fileName + '(rpc)', dst[modName].$rpc)
        outNum += (rwro + rw + rpc)
        let tooltip = trimIndent(`module: '${modName}'\nprefix: '${prefix}'\nrevision: '${revision}'\n${description}`)
        let types = `${rwro ? '(rw+ro)' : ''} ${rw ? '(rw)' : ''} ${rpc ? '(rpc)' : ''}`
        let spanId = (rwro + rw + rpc) ? 'id="r"' : ''
        indexHtmls[i++] = `<li><a id="module"></a><span ${spanId} ${types} title="${tooltip}">${fileName}</span></li>`
    })
    indexHtmls[i++] = '</ol>'
    indexHtmls[i++] = '<script>var yangTypeInfo='
    let yangTypeInfo = { biTypes: [], idTypes: [] }
    dst.$biTypeMap.forEach((v, k) => {
        yangTypeInfo.biTypes[v] = Parser.output('type', k)
    })
    dst.$idTypeMap.forEach((v, k) => {
        yangTypeInfo.idTypes[v] = Parser.output('identity', k)
    })
    indexHtmls[i++] = JSON.stringify(yangTypeInfo)
    indexHtmls[i++] = '</script>'
    fs.writeFileSync(`${OUT_DIR}/index.html`, indexHtmls.join(''))
    return outNum

    function moduleToOthers(name, data, config) {
        if (!data) return 0
        // to json file
        let outputs = [], i = 0
        toJson(data, config)
        if (outputs.length > 2) {
            let outData = JSON.stringify(JSON.parse(outputs.join('')), null, 3)
            fs.writeFileSync(`${OUT_DIR}/${name}.json`, outData)
        }
        // to html file
        outputs = []; i = 0
        toHtml(data, config)
        if (outputs.length > 2) {
            fs.writeFileSync(`${OUT_DIR}/${name}.html`, outputs.join(''))
        }
        return outputs.length > 2 ? 1 : 0

        function toJson(dst, config) {
            let isList = dst._type == 'list'
            outputs[i++] = isList ? '[{' : '{'
            let j = i
            Object.keys(dst).forEach(k => {
                if (k[0] == '$' || k[0] == '_' || (config !== undefined && config !== dst[k]._config))
                    return
                if (/^(choice|case)$/.test(dst[k]._type)) {
                    outputs[i++] = `"${dst[k]._type} ${k}":`
                }
                else if (dst[k]._type == 'list') {
                    outputs[i++] = `"${k}[${dst[k]._key}]":`
                } else {
                    outputs[i++] = `"${k}":`
                }
                if (/^(leaf|leaf-list)$/.test(dst[k]._type)) {
                    let value = `"${dst[k]._config ? 'rw ' : 'ro '}${dst[k].leafType}"`
                    outputs[i++] = dst[k]._type == 'leaf-list' ? `[${value}]` : `${value}`
                } else {
                    toJson(dst[k], config)
                }
                outputs[i++] = ','
            })
            if (i > j) i--
            outputs[i++] = isList ? '}]' : '}'
        }

        function toHtml(dst, config) {
            outputs[i++] = '<ul id="yang">'
            Object.keys(dst).forEach(k => {
                if (k[0] == '$' || k[0] == '_' || (config !== undefined && config !== dst[k]._config)) return
                let isLeaf = /^(leaf|leaf-list)$/.test(dst[k]._type)
                let tooltip = dst[k].$ast.description ? trimIndent(dst[k].$ast.description.argument) : ''
                let key = /^(list|leaf-list)$/.test(dst[k]._type) ? `${k}[${dst[k]._key || ''}]` : k
                if (/^(leaf|choice)$/.test(dst[k]._type) && !dst[k]._mandatory) key += '?'
                let value = isLeaf ? dst[k].leafType : dst[k]._type
                let rw = dst[k]._config ? 'rw' : 'ro'
                let biTypeIndex = dst[k].$biTypeIndex !== undefined ? `data-bi="${dst[k].$biTypeIndex}"` : ''
                let idTypeIndex = dst[k].$idTypeIndex !== undefined ? `data-id="${dst[k].$idTypeIndex}"` : ''
                outputs[i++] = `<li><a id="${dst[k]._type}"></a><span id="${rw}" title="${tooltip}">${key}</span><a ${biTypeIndex} ${idTypeIndex}>${value}</a>`
                if (!isLeaf) toHtml(dst[k], config)
                outputs[i++] = '</li>'
            })
            outputs[i++] = '</ul>'
        }
    }

    function trimIndent(text = '') {
        return text.replace(/\n\s*/g, '\n').replace(/&/g, '&amp;').
            replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
}

function downloadLatestYangFiles(dst) {
    Object.keys(dst).forEach(modName => {
        if (modName[0] == '$') return
        downloadOneYangFile(modName)
    })

    function downloadOneYangFile(modName) {
        getOneUrl('https://www.yangcatalog.org/yang-search/module_details.php?module=' + modName, (body) => {
            let fileName = body.match(/ietf.*\.yang/)[0]
            let yangUrl = body.match(/https:\/\/raw\.githubusercontent\.com[^>]*\//)[0]
            getOneUrl(yangUrl + fileName, (body) => {
                fs.writeFileSync(OUT_DIR + '/' + fileName, body)
            })
        })

    }

    function getOneUrl(url, callback) {
        const req = https.get(url, (res) => {
            let body = []
            res.on('data', function (chunk) {
                body.push(chunk)
            })
            res.on('end', function () {
                callback(body.join(''))
            })
        })
        req.end()
    }
}