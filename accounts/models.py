# accounts/models.py
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
import secrets


# 用户等级定义：(等级, 名称, 所需经验, 徽章颜色)
LEVEL_DEFINITIONS = [
    (1, '新手', 0, 'secondary'),
    (2, '学徒', 50, 'secondary'),
    (3, '漫游者', 150, 'info'),
    (4, '创作者', 300, 'info'),
    (5, '达人', 600, 'primary'),
    (6, '大师', 1000, 'primary'),
    (7, '传奇', 1500, 'success'),
    (8, '贤圣', 2500, 'success'),
    (9, '神话', 4000, 'warning'),
    (10, '幻绮梦', 7000, 'danger'),
]


def get_level_info(experience):
    """根据经验值返回等级信息 (level, name, color, next_exp, progress)"""
    info = LEVEL_DEFINITIONS[0]
    for i, (lv, name, exp, color) in enumerate(LEVEL_DEFINITIONS):
        if experience >= exp:
            info = (lv, name, exp, color)
        else:
            prev_exp = info[2]
            next_exp = exp
            progress = int((experience - prev_exp) / (next_exp - prev_exp) * 100) if next_exp > prev_exp else 100
            return {
                'level': info[0], 'name': info[1], 'color': info[3],
                'current_exp': experience, 'next_exp': next_exp,
                'progress': min(progress, 100),
            }
    # 已达最高级
    return {
        'level': info[0], 'name': info[1], 'color': info[3],
        'current_exp': experience, 'next_exp': None, 'progress': 100,
    }


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('user', '普通用户'),
        ('mod', '管理员'),
        ('owner', '网站拥有者'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    nickname = models.CharField(max_length=50, verbose_name="昵称", blank=True)
    security_question = models.CharField(max_length=200, verbose_name="密保问题", blank=True)
    security_answer = models.CharField(max_length=200, verbose_name="密保答案", blank=True)

    # 角色与禁言
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user', verbose_name="用户角色")
    is_muted = models.BooleanField(default=False, verbose_name="是否被禁言")

    # 邮箱验证相关字段
    email_verified = models.BooleanField(default=False, verbose_name="邮箱是否已验证")
    email_verification_token = models.CharField(max_length=64, blank=True, verbose_name="邮箱验证令牌")
    email_verification_sent_at = models.DateTimeField(null=True, blank=True, verbose_name="验证邮件发送时间")

    # 密码重置相关字段
    password_reset_token = models.CharField(max_length=64, blank=True, verbose_name="密码重置令牌")
    password_reset_sent_at = models.DateTimeField(null=True, blank=True, verbose_name="重置邮件发送时间")

    # 用户统计
    posts_count = models.IntegerField(default=0, verbose_name="发帖数量")
    likes_received = models.IntegerField(default=0, verbose_name="获得的点赞数")

    # 新增：个人资料
    bio = models.TextField(max_length=300, blank=True, verbose_name="个人简介")
    avatar = models.ImageField(upload_to='avatars/%Y/%m/%d/', blank=True, null=True, verbose_name="头像")

    # 新增：等级与经验值
    experience = models.IntegerField(default=0, verbose_name="经验值")
    level = models.IntegerField(default=1, verbose_name="等级")

    def __str__(self):
        return self.nickname or self.user.username

    def generate_email_verification_token(self):
        self.email_verification_token = secrets.token_urlsafe(32)
        self.email_verification_sent_at = timezone.now()
        self.save()
        return self.email_verification_token

    def generate_password_reset_token(self):
        self.password_reset_token = secrets.token_urlsafe(32)
        self.password_reset_sent_at = timezone.now()
        self.save()
        return self.password_reset_token

    def is_verification_token_valid(self, token, expire_hours=24):
        if not self.email_verification_token or self.email_verification_token != token:
            return False
        if not self.email_verification_sent_at:
            return False
        expire_time = self.email_verification_sent_at + timezone.timedelta(hours=expire_hours)
        return timezone.now() < expire_time

    def is_reset_token_valid(self, token, expire_hours=1):
        if not self.password_reset_token or self.password_reset_token != token:
            return False
        if not self.password_reset_sent_at:
            return False
        expire_time = self.password_reset_sent_at + timezone.timedelta(hours=expire_hours)
        return timezone.now() < expire_time

    def get_level_info(self):
        return get_level_info(self.experience)

    def get_display_name(self):
        return self.nickname or self.user.username

    def get_avatar_initial(self):
        name = self.get_display_name()
        return name[0].upper() if name else 'U'


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following')
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')

    def __str__(self):
        return f'{self.follower} -> {self.following}'


class Conversation(models.Model):
    participant1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations_as_p1')
    participant2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations_as_p2')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def get_other_participant(self, user):
        return self.participant2 if self.participant1 == user else self.participant1

    def get_last_message(self):
        return self.messages.order_by('-created_at').first()

    def unread_count(self, user):
        return self.messages.filter(is_read=False).exclude(sender=user).count()


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ['created_at']


class Notification(models.Model):
    NOTIF_TYPES = (
        ('like', '点赞'),
        ('comment', '评论'),
        ('reply', '回复'),
        ('follow', '关注'),
        ('message', '私信'),
        ('mention', '提及'),
        ('essence', '精华'),
        ('system', '系统'),
    )
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='actions')
    notif_type = models.CharField(max_length=20, choices=NOTIF_TYPES, default='system')
    verb = models.CharField(max_length=200)
    url = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
