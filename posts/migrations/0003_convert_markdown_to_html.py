"""把历史 Markdown 正文一次性转换为 HTML（清洗后入库）。

注意：Markdown -> HTML 是单向有损转换，本迁移不可逆（reverse 为 noop）。
执行前请先备份 db.sqlite3。
"""
import markdown
import nh3
from django.db import migrations

# 迁移内冻结一份清洗配置（不 import 应用代码，保证迁移自洽）
_TAGS = {
    "p", "br", "span", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "code", "ol", "ul", "li",
    "a", "img", "hr", "sub", "sup",
}
_ATTRS = {
    "*": {"class", "style"},
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "width", "height"},
    "li": {"data-list"},
}
_STYLE_PROPS = {
    "color", "background-color", "font-size", "font-family",
    "text-align", "padding-left", "margin-left",
    "font-weight", "font-style", "text-decoration",
}


def _convert(text):
    html = markdown.markdown(text or "", extensions=["extra", "sane_lists", "nl2br"])
    return nh3.clean(
        html,
        tags=_TAGS,
        attributes=_ATTRS,
        url_schemes={"http", "https", "mailto"},
        filter_style_properties=_STYLE_PROPS,
        link_rel="noopener noreferrer nofollow",
        strip_comments=True,
        clean_content_tags={"script", "style"},
    )


def forwards(apps, schema_editor):
    Post = apps.get_model("posts", "Post")
    Comment = apps.get_model("posts", "Comment")

    for post in Post.objects.all().only("id", "content"):
        post.content = _convert(post.content)
        post.save(update_fields=["content"])

    for comment in Comment.objects.all().only("id", "content"):
        comment.content = _convert(comment.content)
        comment.save(update_fields=["content"])


class Migration(migrations.Migration):

    dependencies = [("posts", "0002_tag_alter_post_options_post_comments_count_and_more")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
