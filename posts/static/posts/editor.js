/* 富文本编辑器：把带 [data-editor] 的容器初始化为 Quill，内容同步进同名的原生 textarea。
   设计原则：原生 textarea 始终存在且可写；只有在 Quill 成功初始化后，才隐藏 textarea 并用富文本接管。
   这样即使 Quill CDN 被拦、JS 被禁用或初始化异常，用户依然能正常写正文。
   支持：工具栏选图、粘贴图片、拖拽图片上传、Word 粘贴（内嵌图片自动转存）、导入 .docx。 */
(function () {
    'use strict';

    function csrfToken() {
        var el = document.querySelector('[name=csrfmiddlewaretoken]');
        return el ? el.value : '';
    }

    function dataUrlToFile(dataUrl) {
        var parts = String(dataUrl).split(',');
        var m = /:(.*?);/.exec(parts[0] || '');
        var mime = m ? m[1] : 'image/png';
        var bin = window.atob(parts[1] || '');
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return Promise.resolve(new File([arr], 'word-image', { type: mime }));
    }

    function fallback(container, textarea, key) {
        // 保留原生 textarea，隐藏富文本占位容器
        container.style.display = 'none';
        if (textarea) {
            window.__editors[key] = { focus: function () { textarea.focus(); } };
        }
    }

    function initEditor(container) {
        var taSel = container.getAttribute('data-textarea');
        var textarea = taSel ? document.querySelector(taSel) : null;
        var uploadUrl = container.getAttribute('data-upload-url') || '';
        var importUrl = container.getAttribute('data-import-url') || '';
        var placeholder = container.getAttribute('data-placeholder') || '';
        var key = container.id || (textarea && textarea.id) || 'editor';

        window.__editors = window.__editors || {};

        if (!window.Quill) {
            fallback(container, textarea, key);
            return;
        }

        var quill;
        try {
            quill = new Quill(container, {
                theme: 'snow',
                placeholder: placeholder,
                modules: {
                    toolbar: [
                        [{ header: [2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        ['blockquote', 'code-block'],
                        ['link', 'image'],
                        ['clean']
                    ]
                }
            });
        } catch (e) {
            fallback(container, textarea, key);
            return;
        }

        // 用 textarea 里已有的内容作为初始富文本
        if (textarea && textarea.value.trim()) {
            quill.clipboard.dangerouslyPasteHTML(textarea.value);
        }

        function currentHTML() {
            try {
                return quill.getSemanticHTML ? quill.getSemanticHTML() : quill.root.innerHTML;
            } catch (e) {
                return quill.root.innerHTML;
            }
        }

        function sync() {
            if (textarea) textarea.value = currentHTML();
        }

        quill.on('text-change', sync);
        var form = container.closest('form');
        if (form) form.addEventListener('submit', sync);
        sync();

        // Quill 就绪，隐藏原生 textarea（仍作为提交字段，值由 sync 维护）
        if (textarea) textarea.style.display = 'none';

        function uploadImage(file) {
            var fd = new FormData();
            fd.append('image', file);
            return fetch(uploadUrl, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken() },
                body: fd,
                credentials: 'same-origin'
            }).then(function (r) {
                return r.json();
            }).then(function (d) {
                if (!d.url) throw new Error(d.error || '图片上传失败');
                return d.url;
            });
        }

        function insertImage(file) {
            if (!file || !/^image\//.test(file.type)) return;
            uploadImage(file).then(function (url) {
                var range = quill.getSelection(true) || { index: quill.getLength() };
                quill.insertEmbed(range.index, 'image', url, 'user');
                quill.setSelection(range.index + 1, 0, 'user');
            }).catch(function (e) {
                window.alert(e.message || '图片上传失败');
            });
        }

        // 工具栏图片按钮 -> 文件选择（覆盖 Quill 默认的 base64 内联）
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        container.appendChild(fileInput);
        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files[0]) insertImage(fileInput.files[0]);
            fileInput.value = '';
        });
        var toolbar = quill.getModule('toolbar');
        if (toolbar) {
            toolbar.addHandler('image', function () { fileInput.click(); });
        }

        // 粘贴图片（截图等以文件形式出现的）
        quill.root.addEventListener('paste', function (e) {
            var items = (e.clipboardData || {}).items || [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    e.preventDefault();
                    insertImage(items[i].getAsFile());
                    return;
                }
            }
        });

        // 拖拽图片
        quill.root.addEventListener('drop', function (e) {
            var files = (e.dataTransfer || {}).files || [];
            for (var i = 0; i < files.length; i++) {
                if (files[i].type && files[i].type.indexOf('image/') === 0) {
                    e.preventDefault();
                    insertImage(files[i]);
                    return;
                }
            }
        });

        // 导入 .docx
        wireDocxImport(container, importUrl, quill);

        window.__editors[key] = {
            focus: function () { quill.focus(); },
            quill: quill,
            uploadImage: uploadImage
        };
    }

    function wireDocxImport(container, importUrl, quill) {
        if (!importUrl || !container.id) return;
        var btn = document.querySelector('[data-docx-target="#' + container.id + '"]');
        if (!btn) return;

        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx';
        input.style.display = 'none';
        document.body.appendChild(input);

        btn.addEventListener('click', function () { input.click(); });
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            input.value = '';
            if (!file) return;

            var old = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="bi bi-hourglass-split"></i> 导入中…';

            var fd = new FormData();
            fd.append('document', file);
            fetch(importUrl, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken() },
                body: fd,
                credentials: 'same-origin'
            }).then(function (r) {
                return r.json();
            }).then(function (d) {
                if (!d.html) throw new Error(d.error || '导入失败');
                var range = quill.getSelection(true) || { index: quill.getLength() };
                quill.clipboard.dangerouslyPasteHTML(range.index, d.html, 'user');
                quill.setSelection(quill.getLength(), 0, 'user');
            }).catch(function (e) {
                window.alert(e.message || '导入失败');
            }).then(function () {
                btn.disabled = false;
                btn.innerHTML = old;
            });
        });
    }

    // Word 粘贴后，把正文里的 data: 图片转存为站内文件
    function convertDataImages(quill, uploadImage) {
        var index = 0;
        var targets = [];
        (quill.getContents().ops || []).forEach(function (op) {
            if (typeof op.insert === 'string') {
                index += op.insert.length;
            } else if (op.insert && op.insert.image && /^data:image\//i.test(op.insert.image)) {
                targets.push({ index: index, src: op.insert.image });
                index += 1;
            }
        });
        targets.reverse().forEach(function (t) {
            dataUrlToFile(t.src).then(function (file) {
                return uploadImage(file);
            }).then(function (url) {
                quill.deleteText(t.index, 1, 'user');
                quill.insertEmbed(t.index, 'image', url, 'user');
            }).catch(function () {
                window.alert('Word 里的图片上传失败，请重新粘贴或手动上传');
            });
        });
    }

    document.addEventListener('paste', function (e) {
        var t = e.target;
        var container = t && t.closest ? t.closest('[data-editor]') : null;
        if (!container) return;
        var ed = window.__editors && window.__editors[container.id];
        if (!ed || !ed.quill || !ed.uploadImage) return;
        setTimeout(function () { convertDataImages(ed.quill, ed.uploadImage); }, 0);
    }, false);

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[data-editor]').forEach(initEditor);
    });
})();
