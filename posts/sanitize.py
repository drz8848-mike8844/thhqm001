# posts/sanitize.py
"""富文本正文的 HTML 清洗（写入时调用，读取时直接 |safe 输出）。"""
import nh3

# 允许的标签：覆盖 Quill 工具栏与常见排版
QUILL_TAGS = {
    "p", "br", "span", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "code", "ol", "ul", "li",
    "a", "img", "hr", "sub", "sup",
}

# 允许的属性：class/style 必须放行，否则 Quill 的 ql-* 类与对齐/颜色会丢失
QUILL_ATTRS = {
    "*": {"class", "style"},
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "width", "height"},
    "li": {"data-list"},
}

# style 中只保留安全属性，防止 expression/url() 等注入
QUILL_STYLE_PROPS = {
    "color", "background-color", "font-size", "font-family",
    "text-align", "padding-left", "margin-left",
    "font-weight", "font-style", "text-decoration",
}


def clean_html(html):
    """清洗用户提交的富文本 HTML，返回可安全 |safe 输出的字符串。"""
    return nh3.clean(
        html or "",
        tags=QUILL_TAGS,
        attributes=QUILL_ATTRS,
        url_schemes={"http", "https", "mailto"},
        filter_style_properties=QUILL_STYLE_PROPS,
        link_rel="noopener noreferrer nofollow",
        strip_comments=True,
        clean_content_tags={"script", "style"},
    )
