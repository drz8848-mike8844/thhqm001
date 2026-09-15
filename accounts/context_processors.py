# accounts/context_processors.py
from django.db.models import Q
from .models import Notification, Conversation, Message


def unread_counts(request):
    """向模板注入未读通知数和未读私信数"""
    ctx = {'unread_notif_count': 0, 'unread_msg_count': 0}
    if request.user.is_authenticated:
        user = request.user
        ctx['unread_notif_count'] = Notification.objects.filter(
            recipient=user, is_read=False).count()
        convs = Conversation.objects.filter(Q(participant1=user) | Q(participant2=user))
        ctx['unread_msg_count'] = Message.objects.filter(
            conversation__in=convs, is_read=False).exclude(sender=user).count()
    return ctx
