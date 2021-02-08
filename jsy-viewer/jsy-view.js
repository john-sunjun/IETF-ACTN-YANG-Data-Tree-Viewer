/*-
 * ============LICENSE_START=======================================================
 * Copyright (C) 2021 @Author
 * --------------------------------------------------------------------------------
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ============LICENSE_END=========================================================
 */

// show the ACTN yang data tree view
function jsyView() {
    // create top views: naviView + split + dstView
    var naviView = document.createElement('div')
    document.body.appendChild(naviView)
    var dstView = document.createElement('div')
    document.body.appendChild(dstView)
    Split([naviView, dstView], {
        sizes: [25, 75], minSize: [50, 50],
        snapOffset: 0, gutterSize: 4
    })

    // naviView: naviHead(title+options) + body
    var naviHead = document.createElement('div')
    naviHead.classList.add('head')
    naviView.appendChild(naviHead)
    var title = document.createElement('strong')
    title.innerText = document.title
    title.id = 'title'
    naviHead.appendChild(title)
    var dstTypes = [['(rw+ro)'], ['(rw)'], ['(rpc)']]
    dstTypes.forEach(e => {
        e[1] = document.createElement('input')
        e[1].type = 'radio'
        e[1].id = e[0]
        e[1].name = 'dstType'
        naviHead.appendChild(e[1])
        let label = document.createElement('label')
        label.style.marginBottom = '0'
        label.style.marginRight = '1.4em'
        label.htmlFor = e[0]
        label.innerText = e[0]
        naviHead.appendChild(label)
    })
    dstTypes[0][1].checked = true
    dstTypes[0][1].style.marginLeft = '0.5em'
    var dstType = dstTypes[0][0]
    naviHead.onchange = function (e) {
        if (e.target.id != 'all') {
            dstType = e.target.id
            naviView.mList.forEach(m => {
                let hasType = m.children[1].hasAttribute(dstType)
                m.children[1].id = hasType ? 'r' : ''
                m.children[1].onclick = hasType ? onClickModule : null
            })
            if (naviView.currentNode) loadDstView()
        }
        naviView.mList.forEach(m => {
            m.style.display = checkAllMod.checked || m.children[1].id ? '' : 'none'
        })
    }
    var checkAllMod = createCheckBox(naviHead, 'all')

    // dstView: dstHead(dstPath+buttons) + body
    var dstHead = document.createElement('div')
    dstHead.classList.add('head')
    dstHead.style.pointerEvents = 'none'
    dstView.appendChild(dstHead)
    var dstPath = document.createElement('input')
    dstPath.classList.add('dstPath')
    dstPath.readOnly = true
    dstHead.appendChild(dstPath)
    // add 10 buttons to control the unfolding level
    var maxLevel, curLevel, levelBtns = []
    for (let i = 1; i <= 21; i++) {
        let button = document.createElement('button')
        dstHead.appendChild(button)
        button.id = i
        button.innerText = i < 20 ? i : 'All'
        Object.assign(button.style, {
            lineHeight: '1.2em',
            marginRight: '0.04em',
            marginLeft: i == 1 ? '0.1em' : ''
        })
        if (i < 21) {
            levelBtns.push(button)
            button.onclick = function () {
                let level = parseInt(this.id, 10)
                if (level == 20) level = 100
                unfoldToLevel(dstView.dstContent, level)
                if (dstView.currentNode) dstView.currentNode.scrollIntoView(false)
            }
        } else {
            button.innerText = 'JSON'
            Object.assign(button.style, {
                position: 'absolute',
                right: '1px',
                marginRight: '0',
            })
            button.onclick = function () {
                window.open(dstView.src + 'json')
            }
        }
    }
    var checkLeaf = createCheckBox(dstHead, 'leaf*', function () {
        showLeaf(dstView.dstContent, this.checked)
    })

    // simple dialog for showing long tooltip
    var tipDialog = document.createElement('dialog')
    document.body.appendChild(tipDialog)
    tipDialog.id = 'tipDialog'
    tipDialog.innerHTML = '<div style="font-size:14px;font-family:monospace;white-space:pre"></div><form method="dialog"><button>Close</button></form>'

    // load yang module index and data type info
    var frame = document.createElement('iframe')
    var yangTypeInfo = { biTypes: [], idTypes: [] }
    frame.src = 'jsy-output/index.html'
    frame.style.display = 'none'
    document.body.appendChild(frame)
    frame.onload = function () {
        let body = this.contentDocument.body
        naviView.appendChild(body)
        body.style.overflow = 'auto'
        body.style.height = `calc(100% - ${naviHead.offsetHeight}px`
        body.firstElementChild.style.marginLeft = '-2em'
        naviView.mList = Array.from(body.firstElementChild.children)
        naviView.mList.forEach(e => {
            if (e.children[1].id) {
                e.children[1].onclick = onClickModule
            } else {
                e.children[1].onclick = function (e) {
                    if (e.ctrlKey) return showTipDialog(this.title)
                }
            }
        })
        yangTypeInfo = this.contentWindow.yangTypeInfo
    }

    // create a check box to controll display options
    function createCheckBox(container, id, onchange) {
        let checkBox = document.createElement('input')
        checkBox.type = 'checkbox'
        checkBox.id = id
        checkBox.checked = true
        checkBox.style.lineHeight = '1.2em'
        checkBox.onchange = onchange
        container.appendChild(checkBox)

        let label = document.createElement('label')
        label.htmlFor = id
        label.innerText = id
        label.style.lineHeight = '1.2em'
        label.style.marginBottom = '0'
        container.appendChild(label)
        return checkBox
    }

    function showTipDialog(message) {
        if (!message) return
        tipDialog.firstElementChild.innerHTML = message.replace(/(^|\n)(\s*)(\S+):\s'/g,
            function (match, p1, p2, p3) { return `${p1}${p2}<a style="color:DodgerBlue;">${p3}:</a> '` })
        tipDialog.showModal()
    }

    function onClickModule(e) {
        if (e.ctrlKey) return showTipDialog(this.title)
        if (naviView.currentNode == this) return
        if (naviView.currentNode) naviView.currentNode.classList.remove('selected')
        else dstHead.style.pointerEvents = 'auto'
        naviView.currentNode = this
        this.classList.add('selected')
        dstTypes.forEach(e => e[1].disabled = !this.hasAttribute(e[0]))
        loadDstView()
    }

    function loadDstView() {
        if (!naviView.currentNode) return
        frame.src = `jsy-output/${naviView.currentNode.innerText}${dstType}.html`
        frame.onload = function () {
            if (dstView.body) dstView.removeChild(dstView.body)
            dstView.body = this.contentDocument.body
            dstView.src = this.src.slice(0, this.src.length - 4)
            dstView.currentNode = null
            dstPath.value = ''
            dstView.appendChild(dstView.body)
            dstView.body.style.height = `calc(100% - ${dstHead.offsetHeight}px`
            dstView.body.style.overflow = 'auto'
            dstView.dstContent = dstView.body.firstElementChild
            dstView.dstContent.style.marginLeft = '-1em'
            maxLevel = 0; curLevel = 0
            addNodeEventListener(dstView.dstContent)
            levelBtns.forEach((b, i) => b.hidden = i >= maxLevel)
            showLeaf(dstView.dstContent, checkLeaf.checked)
        }
    }

    // add click event listener to all foldable list items
    function addNodeEventListener(tree) {
        if (++curLevel > maxLevel) maxLevel = curLevel
        for (let i = 0; i < tree.children.length; i++) {
            let c = tree.children[i]
            if (c.tagName == 'LI') {
                c.children[1].onclick = function (e) {
                    if (e.ctrlKey) return showTipDialog(this.title)
                    updateDstPath(this)
                }
                let ul = c.getElementsByTagName('UL')[0]
                if (ul && ul.children.length) {
                    c.children[0].classList.add('toggle')
                    c.children[0].onclick = function () { toggleNode(this) }
                    c.children[1].ondblclick = function () { toggleNode(this.parentElement.children[0]) }
                    addNodeEventListener(ul)
                } else {
                    c.children[2].onmouseover = function () {
                        let biTypeIndex = c.children[2].dataset.bi
                        if (biTypeIndex && !c.children[2].title) {
                            c.children[2].title = yangTypeInfo.biTypes[biTypeIndex]
                        }
                        let idTypeIndex = c.children[2].dataset.id
                        if (idTypeIndex && !c.children[2].title) {
                            c.children[2].title = yangTypeInfo.idTypes[idTypeIndex]
                        }
                    }
                    c.children[2].onclick = function (e) {
                        if (e.ctrlKey) return showTipDialog(this.title)
                    }
                }
            }
        }
        curLevel--
    }

    // show or hide children under this node
    function toggleNode(node) {
        let ul = node.parentElement.getElementsByTagName('UL')[0]
        ul.style.display = ul.style.display ? '' : 'none'
        node.classList.toggle("collapsed")
    }

    // Unfold the tree to the chosen level
    function unfoldToLevel(tree, level) {
        level--
        for (let i = 0; i < tree.children.length; i++) {
            let c = tree.children[i]
            if (c.tagName == 'LI') {
                let ul = c.getElementsByTagName('UL')[0]
                if (ul && ul.children.length) {
                    if (level > 0) {
                        ul.style.display = ''
                        c.children[0].classList.remove("collapsed")
                        unfoldToLevel(ul, level)
                    } else {
                        ul.style.display = 'none'
                        c.children[0].classList.add("collapsed")
                    }
                }
            }
        }
        level++
    }

    // show or hide leafs and leaf-lists
    function showLeaf(tree, show) {
        for (let i = 0; i < tree.children.length; i++) {
            let c = tree.children[i]
            if (c.tagName == 'LI' && /^(leaf|leaf-list)$/.test(c.children[0].id)) {
                c.style.display = show ? '' : 'none'
            }
            let ul = c.getElementsByTagName('UL')[0]
            if (ul && ul.children.length) {
                showLeaf(ul, show)
            }
        }
    }

    // update the path of a selected YANG data node
    function updateDstPath(node) {
        if (dstView.currentNode) dstView.currentNode.classList.remove('selected')
        dstView.currentNode = node
        node.classList.add('selected')
        node = node.parentElement
        let path = []
        while (node && node != dstView.body) {
            if (!/^(choice|case)$/.test(node.children[0].id)) {
                path.unshift(node.children[1].innerText.split('[')[0])
            }
            node = node.parentElement.parentElement
        }
        path[0] = ':' + path[0]
        dstPath.value = path.join('/')
    }
}
