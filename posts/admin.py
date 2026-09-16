# posts/admin.py
from django.contrib import admin
from .models import Post, Tag, PostImage, Comment, CommentLike, Report


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'created_at', 'likes_count', 'favorites_count',
                    'views_count', 'comments_count', 'is_pinned', 'is_essence')
    list_filter = ('created_at', 'author', 'is_pinned', 'is_essence', 'tags')
    search_fields = ('title', 'content')
    date_hierarchy = 'created_at'
    filter_horizontal = ('tags',)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(PostImage)
class PostImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'post', 'created_at')


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('author', 'post', 'content_preview', 'created_at', 'likes_count')
    search_fields = ('content', 'author__username')

    def content_preview(self, obj):
        return obj.content[:30]
    content_preview.short_description = '内容'


@admin.register(CommentLike)
class CommentLikeAdmin(admin.ModelAdmin):
    list_display = ('user', 'comment', 'created_at')


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('reporter', 'post', 'reason', 'created_at', 'is_resolved')
    list_filter = ('reason', 'is_resolved')
    search_fields = ('description', 'reporter__username')
