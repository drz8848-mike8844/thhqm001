# accounts/utils.py
import re
from django.core.mail import send_mail
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from django.utils.html import strip_tags
from django.contrib.auth.models import User
import logging

logger = logging.getLogger(__name__)

MENTION_RE = re.compile(r'@(\w+)')


def send_verification_email(request, user):
    """发送邮箱验证邮件"""
    try:
        token = user.profile.generate_email_verification_token()
        verify_url = request.build_absolute_uri(
            reverse('verify_email', kwargs={'token': token})
        )
        subject = f'{settings.EMAIL_SUBJECT_PREFIX}请验证您的邮箱地址'
        message = f'''
亲爱的 {user.profile.nickname or user.username}：

感谢您注册东方幻绮梦！

请点击以下链接验证您的邮箱地址：
{verify_url}

此链接将在 {settings.EMAIL_VERIFICATION_EXPIRE_HOURS} 小时后失效。

如果您没有注册此账号，请忽略此邮件。

祝好，
东方幻绮梦团队
'''
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
        logger.info(f"验证邮件已发送至 {user.email}")
        return True
    except Exception as e:
        logger.error(f"发送验证邮件失败: {str(e)}")
        return False


def send_password_reset_email(request, user):
    """发送密码重置邮件"""
    try:
        token = user.profile.generate_password_reset_token()
        reset_url = request.build_absolute_uri(
            reverse('reset_password_confirm', kwargs={'token': token})
        )
        subject = f'{settings.EMAIL_SUBJECT_PREFIX}重置您的密码'
        message = f'''
亲爱的 {user.profile.nickname or user.username}：

我们收到了您的密码重置请求。

请点击以下链接重置您的密码：
{reset_url}

此链接将在 {settings.PASSWORD_RESET_EXPIRE_HOURS} 小时后失效。

如果您没有请求重置密码，请忽略此邮件，您的密码不会被更改。

祝好，
东方幻绮梦团队
'''
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
        logger.info(f"密码重置邮件已发送至 {user.email}")
        return True
    except Exception as e:
        logger.error(f"发送密码重置邮件失败: {str(e)}")
        return False


def create_notification(recipient, actor, notif_type, verb, url=''):
    """创建站内通知（不通知自己）"""
    if recipient == actor:
        return None
    try:
        from .models import Notification
        return Notification.objects.create(
            recipient=recipient, actor=actor,
            notif_type=notif_type, verb=verb, url=url,
        )
    except Exception as e:
        logger.error(f"创建通知失败: {str(e)}")
        return None


def add_experience(user, points):
    """增加用户经验值并更新等级"""
    if not hasattr(user, 'profile'):
        return
    profile = user.profile
    profile.experience = max(0, profile.experience + points)
    from .models import get_level_info
    profile.level = get_level_info(profile.experience)['level']
    profile.save(update_fields=['experience', 'level'])


def parse_mentions(text):
    """从文本中解析 @用户名，返回存在的 User 查询集（正文可能是 HTML，先剥离标签）"""
    usernames = set(MENTION_RE.findall(strip_tags(text or '')))
    if not usernames:
        return []
    return list(User.objects.filter(username__in=usernames))


def notify_mentions(text, actor, url):
    """解析文本中的 @提及 并发送通知"""
    for u in parse_mentions(text):
        create_notification(u, actor, 'mention', f'{actor.profile.get_display_name()} 提到了你', url)


def update_user_statistics(user):
    """更新用户统计数据（含经验值与等级）"""
    from posts.models import Post, Like, Comment

    profile = user.profile
    profile.posts_count = user.posts.count()

    user_posts = user.posts.all()
    likes_received = Like.objects.filter(post__in=user_posts).count()
    profile.likes_received = likes_received

    # 经验值 = 发帖*5 + 获赞*2 + 评论*1 + 被关注*3
    comments_count = Comment.objects.filter(author=user).count()
    from .models import Follow
    followers_count = Follow.objects.filter(following=user).count()
    experience = (profile.posts_count * 5 + likes_received * 2
                  + comments_count * 1 + followers_count * 3)
    profile.experience = experience

    from .models import get_level_info
    profile.level = get_level_info(experience)['level']

    profile.save()
