from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.contrib.auth.models import User
from django.contrib.auth.forms import PasswordChangeForm
from django.conf import settings
from django.http import Http404, JsonResponse, HttpResponseForbidden
from django.db.models import Q
from django.core.paginator import Paginator

from .models import UserProfile, Follow, Conversation, Message, Notification
from .forms import (RegisterForm, ProfileEditForm, PasswordResetRequestForm,
                    PasswordResetConfirmForm, MessageForm)
from .utils import (send_verification_email, send_password_reset_email,
                    update_user_statistics, create_notification, add_experience)
from .decorators import not_muted_required, is_staff_or_owner


def register(request):
    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save(commit=False)
            user.set_password(form.cleaned_data['password'])
            user.is_active = True
            user.save()
            user.profile.nickname = form.cleaned_data['nickname']
            user.profile.security_question = form.cleaned_data['security_question']
            user.profile.security_answer = form.cleaned_data['security_answer']
            user.profile.save()
            if send_verification_email(request, user):
                messages.success(request, "注册成功！验证邮件已发送至您的邮箱，请查收。")
            else:
                messages.warning(request, "注册成功，但验证邮件发送失败，请稍后在个人中心重新发送。")
            return redirect('login')
    else:
        form = RegisterForm()
    return render(request, 'accounts/register.html', {'form': form})


def verify_email(request, token):
    try:
        profile = UserProfile.objects.get(email_verification_token=token)
        if profile.is_verification_token_valid(token, settings.EMAIL_VERIFICATION_EXPIRE_HOURS):
            profile.email_verified = True
            profile.email_verification_token = ''
            profile.email_verification_sent_at = None
            profile.save()
            messages.success(request, "邮箱验证成功！")
        else:
            messages.error(request, "验证链接已失效或无效，请重新发送验证邮件。")
    except UserProfile.DoesNotExist:
        messages.error(request, "无效的验证链接。")
    return redirect('login')


@login_required
def resend_verification_email(request):
    if request.user.profile.email_verified:
        messages.info(request, "您的邮箱已经验证过了。")
    else:
        if send_verification_email(request, request.user):
            messages.success(request, "验证邮件已重新发送，请查收。")
        else:
            messages.error(request, "验证邮件发送失败，请稍后重试。")
    return redirect('profile')


@login_required
def profile(request):
    update_user_statistics(request.user)
    user_posts = request.user.posts.all().order_by('-created_at')[:5]
    following_count = Follow.objects.filter(follower=request.user).count()
    followers_count = Follow.objects.filter(following=request.user).count()
    context = {
        'user_posts': user_posts,
        'email_verification_required': settings.EMAIL_VERIFICATION_REQUIRED,
        'following_count': following_count,
        'followers_count': followers_count,
    }
    return render(request, 'accounts/profile.html', context)


@login_required
def user_home(request, username):
    """查看他人主页"""
    target = get_object_or_404(User, username=username)
    update_user_statistics(target)
    user_posts = target.posts.all().order_by('-created_at')[:10]
    is_following = Follow.objects.filter(follower=request.user, following=target).exists()
    following_count = Follow.objects.filter(follower=target).count()
    followers_count = Follow.objects.filter(following=target).count()
    context = {
        'target': target,
        'user_posts': user_posts,
        'is_following': is_following,
        'following_count': following_count,
        'followers_count': followers_count,
    }
    return render(request, 'accounts/user_home.html', context)


@login_required
def profile_edit(request):
    if request.method == 'POST':
        form = ProfileEditForm(request.POST, request.FILES, instance=request.user)
        if form.is_valid():
            user = form.save(commit=False)
            user.profile.nickname = form.cleaned_data['nickname']
            user.profile.bio = form.cleaned_data['bio']
            if form.cleaned_data.get('avatar'):
                user.profile.avatar = form.cleaned_data['avatar']
            user.profile.security_question = form.cleaned_data['security_question']
            user.profile.security_answer = form.cleaned_data['security_answer']
            if user.email != request.user.email:
                user.profile.email_verified = False
                messages.info(request, "邮箱地址已更改，请重新验证。")
            user.save()
            user.profile.save()
            messages.success(request, "个人资料更新成功！")
            return redirect('profile')
    else:
        form = ProfileEditForm(instance=request.user)
        form.fields['nickname'].initial = request.user.profile.nickname
        form.fields['bio'].initial = request.user.profile.bio
        form.fields['security_question'].initial = request.user.profile.security_question
        form.fields['security_answer'].initial = request.user.profile.security_answer
    return render(request, 'accounts/profile_edit.html', {'form': form})


@login_required
def change_password(request):
    if request.method == 'POST':
        form = PasswordChangeForm(request.user, request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, "密码修改成功！请重新登录。")
            return redirect('login')
    else:
        form = PasswordChangeForm(request.user)
    return render(request, 'accounts/change_password.html', {'form': form})


def password_reset_request(request):
    if request.method == 'POST':
        form = PasswordResetRequestForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            try:
                user = User.objects.get(email=email)
                if send_password_reset_email(request, user):
                    messages.success(request, "密码重置邮件已发送至您的邮箱，请查收。")
                else:
                    messages.error(request, "邮件发送失败，请稍后重试。")
            except User.DoesNotExist:
                messages.success(request, "如果该邮箱已注册，您将收到密码重置邮件。")
            return redirect('login')
    else:
        form = PasswordResetRequestForm()
    return render(request, 'accounts/password_reset_request.html', {'form': form})


def reset_password_confirm(request, token):
    try:
        profile = UserProfile.objects.get(password_reset_token=token)
        if not profile.is_reset_token_valid(token, settings.PASSWORD_RESET_EXPIRE_HOURS):
            messages.error(request, "重置链接已失效或无效。")
            return redirect('password_reset_request')
        if request.method == 'POST':
            form = PasswordResetConfirmForm(request.POST)
            if form.is_valid():
                user = profile.user
                user.set_password(form.cleaned_data['password'])
                user.save()
                profile.password_reset_token = ''
                profile.password_reset_sent_at = None
                profile.save()
                messages.success(request, "密码重置成功！请使用新密码登录。")
                return redirect('login')
        else:
            form = PasswordResetConfirmForm()
        return render(request, 'accounts/reset_password_confirm.html', {'form': form})
    except UserProfile.DoesNotExist:
        messages.error(request, "无效的重置链接。")
        return redirect('password_reset_request')


def reset_password(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        answer = request.POST.get('answer')
        new_pwd = request.POST.get('new_password')
        try:
            user = User.objects.get(username=username)
            if user.profile.security_answer and user.profile.security_answer.lower() == answer.lower():
                user.set_password(new_pwd)
                user.save()
                messages.success(request, "密码重置成功！请登录。")
                return redirect('login')
            else:
                messages.error(request, "密保答案错误")
        except User.DoesNotExist:
            messages.error(request, "用户不存在")
    username_q = request.GET.get('username')
    question = ""
    if username_q:
        try:
            user = User.objects.get(username=username_q)
            question = user.profile.security_question or "未设置密保问题"
        except Exception:
            pass
    return render(request, 'accounts/reset_password.html', {'question': question})


# ==================== 私信 ====================
@login_required
def inbox(request):
    conversations = Conversation.objects.filter(
        Q(participant1=request.user) | Q(participant2=request.user)
    )
    conv_list = []
    for c in conversations:
        other = c.get_other_participant(request.user)
        last = c.get_last_message()
        conv_list.append({
            'conv': c, 'other': other, 'last': last,
            'unread': c.unread_count(request.user),
        })
    return render(request, 'accounts/inbox.html', {'conv_list': conv_list})


@login_required
def conversation(request, pk):
    conv = get_object_or_404(Conversation, pk=pk)
    if request.user != conv.participant1 and request.user != conv.participant2:
        return HttpResponseForbidden("无权访问此会话")
    other = conv.get_other_participant(request.user)

    if request.method == 'POST':
        form = MessageForm(request.POST)
        if form.is_valid():
            Message.objects.create(
                conversation=conv, sender=request.user,
                content=form.cleaned_data['content'],
            )
            conv.save()  # 更新 updated_at
            create_notification(other, request.user, 'message',
                                f'{request.user.profile.get_display_name()} 给你发了一条消息',
                                f'/accounts/messages/{conv.id}/')
            return redirect('conversation', pk=conv.id)
    else:
        form = MessageForm()

    # 标记已读
    conv.messages.filter(is_read=False).exclude(sender=request.user).update(is_read=True)

    return render(request, 'accounts/conversation.html', {
        'conv': conv, 'other': other, 'messages': conv.messages.all(), 'form': form,
    })


@login_required
def start_conversation(request, username):
    target = get_object_or_404(User, username=username)
    if target == request.user:
        messages.error(request, "不能给自己发私信")
        return redirect('inbox')
    conv = Conversation.objects.filter(
        Q(participant1=request.user, participant2=target) |
        Q(participant1=target, participant2=request.user)
    ).first()
    if not conv:
        conv = Conversation.objects.create(participant1=request.user, participant2=target)
    return redirect('conversation', pk=conv.id)


# ==================== 通知 ====================
@login_required
def notifications(request):
    notifs = request.user.notifications.all()
    paginator = Paginator(notifs, 20)
    page_obj = paginator.get_page(request.GET.get('page'))
    return render(request, 'accounts/notifications.html', {'page_obj': page_obj})


@login_required
def mark_notification_read(request, pk):
    if request.method == 'POST':
        n = get_object_or_404(Notification, pk=pk, recipient=request.user)
        n.is_read = True
        n.save()
        return JsonResponse({'ok': True})
    return JsonResponse({'error': 'Invalid'}, status=400)


@login_required
def mark_all_notifications_read(request):
    if request.method == 'POST':
        request.user.notifications.filter(is_read=False).update(is_read=True)
        return JsonResponse({'ok': True})
    return JsonResponse({'error': 'Invalid'}, status=400)


# ==================== 关注 ====================
@login_required
def follow(request, username):
    if request.method == 'POST':
        target = get_object_or_404(User, username=username)
        if target != request.user:
            _, created = Follow.objects.get_or_create(follower=request.user, following=target)
            if created:
                add_experience(target, 3)
                create_notification(target, request.user, 'follow',
                                    f'{request.user.profile.get_display_name()} 关注了你',
                                    f'/accounts/u/{request.user.username}/')
        return JsonResponse({'following': True})
    return JsonResponse({'error': 'Invalid'}, status=400)


@login_required
def unfollow(request, username):
    if request.method == 'POST':
        Follow.objects.filter(follower=request.user, following__username=username).delete()
        return JsonResponse({'following': False})
    return JsonResponse({'error': 'Invalid'}, status=400)


@login_required
def following_list(request):
    users = User.objects.filter(followers__follower=request.user)
    return render(request, 'accounts/follow_list.html', {'users': users, 'mode': 'following'})


@login_required
def followers_list(request):
    users = User.objects.filter(following__following=request.user)
    return render(request, 'accounts/follow_list.html', {'users': users, 'mode': 'followers'})
