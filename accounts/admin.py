# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import UserProfile, Follow, Conversation, Message, Notification


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = '用户权限与资料'
    readonly_fields = ('email_verified_display', 'experience', 'level')

    def email_verified_display(self, obj):
        return obj.email_verified
    email_verified_display.short_description = '邮箱验证状态'
    email_verified_display.boolean = True


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)

    def get_readonly_fields(self, request, obj=None):
        if not request.user.is_superuser:
            return ['is_superuser']
        return super().get_readonly_fields(request, obj)

    list_display = ('username', 'email', 'nickname_display', 'role_display', 'email_verified_display',
                    'is_muted_display', 'level_display', 'posts_count_display', 'likes_received_display',
                    'is_staff', 'date_joined')
    list_filter = ('profile__role', 'profile__is_muted', 'profile__email_verified', 'is_staff')
    search_fields = ('username', 'email', 'profile__nickname')

    def nickname_display(self, obj):
        return obj.profile.nickname or '-'
    nickname_display.short_description = '昵称'

    def role_display(self, obj):
        return obj.profile.get_role_display()
    role_display.short_description = '角色'

    def email_verified_display(self, obj):
        return obj.profile.email_verified
    email_verified_display.short_description = '邮箱验证'
    email_verified_display.boolean = True

    def is_muted_display(self, obj):
        return obj.profile.is_muted
    is_muted_display.boolean = True
    is_muted_display.short_description = '禁言'

    def level_display(self, obj):
        return f'Lv{obj.profile.level}'
    level_display.short_description = '等级'

    def posts_count_display(self, obj):
        return obj.profile.posts_count
    posts_count_display.short_description = '发帖数'

    def likes_received_display(self, obj):
        return obj.profile.likes_received
    likes_received_display.short_description = '获赞数'


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ('follower', 'following', 'created_at')
    search_fields = ('follower__username', 'following__username')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'participant1', 'participant2', 'updated_at')
    search_fields = ('participant1__username', 'participant2__username')


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'sender', 'content_preview', 'created_at', 'is_read')
    list_filter = ('is_read',)

    def content_preview(self, obj):
        return obj.content[:30]
    content_preview.short_description = '内容'


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'actor', 'notif_type', 'verb', 'is_read', 'created_at')
    list_filter = ('notif_type', 'is_read')
    search_fields = ('recipient__username', 'verb')
