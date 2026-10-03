# posts/views.py
import mimetypes
import uuid
from datetime import date

import mammoth
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden
from django.db.models import Q, Count, F
from django.contrib import messages
from django.core.paginator import Paginator
from django.core.files.base import File
from django.core.files.storage import default_storage
from PIL import Image
from .models import Post, Like, Favorite, Comment, CommentLike, Tag, Report
from .forms import PostForm, CommentForm, ReportForm
from .sanitize import clean_html
from accounts.decorators import is_staff_or_owner, not_muted_required, role_required
from accounts.utils import (update_user_statistics, create_notification,
                            add_experience, notify_mentions)


def home(request):
    from django.contrib.auth.models import User
    latest_posts = Post.objects.all()[:5]
    hot_posts = Post.objects.annotate(
        _score=F('likes_count') + F('comments_count') + F('views_count')
    ).order_by('-_score')[:5]
    tags = Tag.objects.annotate(post_count=Count('posts')).order_by('-post_count')[:12]
    stats = {
        'posts': Post.objects.count(),
        'users': User.objects.count(),
        'comments': Comment.objects.count(),
        'tags': Tag.objects.count(),
    }
    return render(request, 'home.html', {
        'latest_posts': latest_posts, 'hot_posts': hot_posts,
        'tags': tags, 'stats': stats,
    })


def post_list(request):
    query = request.GET.get('q', '').strip()
    tag_name = request.GET.get('tag', '').strip()
    author_name = request.GET.get('author', '').strip()
    order = request.GET.get('order', 'new')

    posts = Post.objects.all()
    if query:
        posts = posts.filter(Q(title__icontains=query) | Q(content__icontains=query))
    if tag_name:
        posts = posts.filter(tags__name=tag_name)
    if author_name:
        posts = posts.filter(author__username=author_name)

    if order == 'hot':
        posts = posts.annotate(_score=F('likes_count') + F('comments_count') + F('views_count')).order_by('-is_pinned', '-_score')
    elif order == 'liked':
        posts = posts.order_by('-is_pinned', '-likes_count')
    elif order == 'discussed':
        posts = posts.order_by('-is_pinned', '-comments_count')
    else:
        posts = posts.order_by('-is_pinned', '-created_at')

    paginator = Paginator(posts, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    user_likes = []
    user_favs = []
    is_staff = False
    if request.user.is_authenticated:
        user_likes = Like.objects.filter(user=request.user).values_list('post_id', flat=True)
        user_favs = Favorite.objects.filter(user=request.user).values_list('post_id', flat=True)
        is_staff = is_staff_or_owner(request.user)

    all_tags = Tag.objects.annotate(post_count=Count('posts')).order_by('-post_count')[:20]

    return render(request, 'posts/list.html', {
        'page_obj': page_obj,
        'posts': page_obj.object_list,
        'query': query,
        'tag_name': tag_name,
        'author_name': author_name,
        'order': order,
        'user_likes': list(user_likes),
        'user_favs': list(user_favs),
        'is_staff': is_staff,
        'all_tags': all_tags,
    })


def post_detail(request, pk):
    post = get_object_or_404(Post, pk=pk)

    # 浏览量 +1（同一会话内不重复计数）
    session_key = f'viewed_post_{post.id}'
    if not request.session.get(session_key):
        post.views_count += 1
        post.save(update_fields=['views_count'])
        request.session[session_key] = True

    # 顶级评论及其回复
    top_comments = post.comments.filter(parent__isnull=True)
    comments_with_replies = []
    for c in top_comments:
        comments_with_replies.append((c, c.replies.all()))

    user_liked = False
    user_favorited = False
    liked_comment_ids = []
    is_staff = False
    if request.user.is_authenticated:
        user_liked = Like.objects.filter(user=request.user, post=post).exists()
        user_favorited = Favorite.objects.filter(user=request.user, post=post).exists()
        liked_comment_ids = list(CommentLike.objects.filter(user=request.user, comment__post=post).values_list('comment_id', flat=True))
        is_staff = is_staff_or_owner(request.user)

    return render(request, 'posts/detail.html', {
        'post': post,
        'comments_with_replies': comments_with_replies,
        'form': CommentForm(),
        'user_liked': user_liked,
        'user_favorited': user_favorited,
        'liked_comment_ids': liked_comment_ids,
        'is_staff': is_staff,
    })


@login_required
@not_muted_required
def post_create(request):
    if request.method == 'POST':
        form = PostForm(request.POST)
        if form.is_valid():
            post = form.save(commit=False)
            post.author = request.user
            post.save()
            form._save_tags(post)

            update_user_statistics(request.user)
            add_experience(request.user, 5)
            messages.success(request, "发布成功！")
            return redirect('post_detail', pk=post.id)
    else:
        form = PostForm()
    return render(request, 'posts/form.html', {'form': form, 'is_edit': False})


@login_required
@not_muted_required
def post_edit(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if request.user != post.author and not is_staff_or_owner(request.user):
        return HttpResponseForbidden("你没有权限编辑此帖子")

    if request.method == 'POST':
        form = PostForm(request.POST, instance=post)
        if form.is_valid():
            post = form.save()
            messages.success(request, "修改已保存！")
            return redirect('post_detail', pk=post.id)
    else:
        form = PostForm(instance=post, initial={
            'tags_input': ', '.join(post.tags.values_list('name', flat=True)),
        })
    return render(request, 'posts/form.html', {'form': form, 'is_edit': True, 'post': post})


MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'GIF': 'gif', 'WEBP': 'webp'}


@login_required
@not_muted_required
def upload_editor_image(request):
    """富文本编辑器内联图片上传：接收粘贴/拖拽/选择的图片，返回可插入的 URL。"""
    if request.method != 'POST':
        return JsonResponse({'error': '仅支持 POST'}, status=405)

    f = request.FILES.get('image')
    if not f:
        return JsonResponse({'error': '未收到图片'}, status=400)
    if f.size > MAX_IMAGE_BYTES:
        return JsonResponse({'error': '图片不能超过 5MB'}, status=400)

    try:
        img = Image.open(f)
        img.verify()                       # 校验是真实图片
        fmt = (img.format or '').upper()
        f.seek(0)
        Image.open(f).load()               # verify() 后需重新打开才能再读
    except Exception:
        return JsonResponse({'error': '无效的图片文件'}, status=400)

    ext = ALLOWED_IMAGE_FORMATS.get(fmt)
    if not ext:
        return JsonResponse({'error': '仅支持 JPG/PNG/GIF/WEBP'}, status=400)

    # 随机文件名 + 由校验格式推导扩展名，忽略原始文件名以杜绝路径穿越
    name = f"posts/editor/{date.today():%Y/%m/%d}/{uuid.uuid4().hex}.{ext}"
    saved = default_storage.save(name, f)
    return JsonResponse({'url': default_storage.url(saved)})


MAX_DOCX_BYTES = 10 * 1024 * 1024


def _save_docx_image(image):
    """mammoth 图片回调：把 .docx 内嵌图片存进 MEDIA 并返回站内 URL。"""
    ext = mimetypes.guess_extension(image.content_type or 'image/png') or '.png'
    if ext == '.jpe':
        ext = '.jpg'
    name = f"posts/editor/{date.today():%Y/%m/%d}/{uuid.uuid4().hex}{ext}"
    with image.open() as f:
        saved = default_storage.save(name, File(f))
    return {'src': default_storage.url(saved)}


@login_required
@not_muted_required
def import_docx(request):
    """把上传的 .docx 转成 HTML 返回，供编辑器插入正文。"""
    if request.method != 'POST':
        return JsonResponse({'error': '仅支持 POST'}, status=405)

    f = request.FILES.get('document')
    if not f:
        return JsonResponse({'error': '未收到文件'}, status=400)
    if f.size > MAX_DOCX_BYTES:
        return JsonResponse({'error': '文件不能超过 10MB'}, status=400)
    if not f.name.lower().endswith('.docx'):
        return JsonResponse({'error': '仅支持 .docx 文件'}, status=400)

    try:
        result = mammoth.convert_to_html(
            f, convert_image=mammoth.images.img_element(_save_docx_image)
        )
    except Exception:
        return JsonResponse({'error': '无法解析该 .docx 文件'}, status=400)

    return JsonResponse({'html': clean_html(result.value)})


@login_required
def post_delete(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if request.user != post.author and not is_staff_or_owner(request.user):
        return HttpResponseForbidden("你没有权限删除此帖子")

    if request.method == 'POST':
        post.delete()
        update_user_statistics(request.user)
        messages.success(request, "帖子已删除。")
    return redirect('post_list')


@login_required
def toggle_like(request, pk):
    if request.method == 'POST':
        post = get_object_or_404(Post, pk=pk)
        like, created = Like.objects.get_or_create(user=request.user, post=post)
        if not created:
            like.delete()
            post.likes_count -= 1
            liked = False
            add_experience(post.author, -2)
        else:
            post.likes_count += 1
            liked = True
            add_experience(post.author, 2)
            create_notification(post.author, request.user, 'like',
                                f'{request.user.profile.get_display_name()} 赞了你的帖子《{post.title}》',
                                f'/posts/{post.id}/')
        post.save()
        return JsonResponse({'count': post.likes_count, 'liked': liked})
    return JsonResponse({'error': 'Invalid request'}, status=400)


@login_required
def toggle_favorite(request, pk):
    if request.method == 'POST':
        post = get_object_or_404(Post, pk=pk)
        fav, created = Favorite.objects.get_or_create(user=request.user, post=post)
        if not created:
            fav.delete()
            post.favorites_count -= 1
            faved = False
        else:
            post.favorites_count += 1
            faved = True
        post.save()
        return JsonResponse({'count': post.favorites_count, 'favorited': faved})
    return JsonResponse({'error': 'Invalid request'}, status=400)


@login_required
def favorites_list(request):
    favorites = Favorite.objects.filter(user=request.user).values_list('post', flat=True)
    posts = Post.objects.filter(id__in=favorites)
    return render(request, 'posts/favorites.html', {'posts': posts})


@login_required
@not_muted_required
def add_comment(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if request.method == 'POST':
        form = CommentForm(request.POST)
        if form.is_valid():
            comment = Comment.objects.create(
                post=post, author=request.user,
                content=form.cleaned_data['content'],
            )
            parent_id = request.POST.get('parent_id')
            if parent_id:
                try:
                    comment.parent = Comment.objects.get(id=parent_id, post=post)
                    comment.save()
                except Comment.DoesNotExist:
                    pass

            post.comments_count += 1
            post.save()

            add_experience(request.user, 1)

            # 通知
            detail_url = f'/posts/{post.id}/'
            if comment.parent:
                create_notification(comment.parent.author, request.user, 'reply',
                                    f'{request.user.profile.get_display_name()} 回复了你的评论',
                                    detail_url)
            else:
                create_notification(post.author, request.user, 'comment',
                                    f'{request.user.profile.get_display_name()} 评论了你的帖子《{post.title}》',
                                    detail_url)
            notify_mentions(comment.content, request.user, detail_url)

            messages.success(request, "评论成功！")
        else:
            messages.error(request, "评论内容不能为空。")
    return redirect('post_detail', pk=post.id)


@login_required
def delete_comment(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    if request.user != comment.author and not is_staff_or_owner(request.user):
        return HttpResponseForbidden("你没有权限删除此评论")
    if request.method == 'POST':
        post = comment.post
        # 减去该评论及其所有回复的数量
        count = 1 + comment.replies.count()
        comment.delete()
        post.comments_count = max(0, post.comments_count - count)
        post.save()
        messages.success(request, "评论已删除。")
    return redirect('post_detail', pk=comment.post_id if comment.id else pk)


@login_required
def toggle_comment_like(request, pk):
    if request.method == 'POST':
        comment = get_object_or_404(Comment, pk=pk)
        cl, created = CommentLike.objects.get_or_create(user=request.user, comment=comment)
        if not created:
            cl.delete()
            comment.likes_count -= 1
            liked = False
        else:
            comment.likes_count += 1
            liked = True
            create_notification(comment.author, request.user, 'like',
                                f'{request.user.profile.get_display_name()} 赞了你的评论',
                                f'/posts/{comment.post.id}/')
        comment.save()
        return JsonResponse({'count': comment.likes_count, 'liked': liked})
    return JsonResponse({'error': 'Invalid request'}, status=400)


def posts_by_tag(request, tag):
    tag_obj = get_object_or_404(Tag, name=tag)
    posts = tag_obj.posts.all()
    return render(request, 'posts/list.html', {
        'posts': posts,
        'tag_name': tag,
        'query': '',
        'user_likes': list(Like.objects.filter(user=request.user).values_list('post_id', flat=True)) if request.user.is_authenticated else [],
        'user_favs': list(Favorite.objects.filter(user=request.user).values_list('post_id', flat=True)) if request.user.is_authenticated else [],
        'is_staff': is_staff_or_owner(request.user) if request.user.is_authenticated else False,
        'all_tags': Tag.objects.annotate(post_count=Count('posts')).order_by('-post_count')[:20],
    })


@role_required('mod', 'owner')
def toggle_pin(request, pk):
    post = get_object_or_404(Post, pk=pk)
    post.is_pinned = not post.is_pinned
    post.save()
    messages.success(request, "置顶" if post.is_pinned else "取消置顶")
    return redirect('post_detail', pk=post.id)


@role_required('mod', 'owner')
def toggle_essence(request, pk):
    post = get_object_or_404(Post, pk=pk)
    post.is_essence = not post.is_essence
    post.save()
    if post.is_essence:
        create_notification(post.author, request.user, 'essence',
                            f'你的帖子《{post.title}》被设为精华',
                            f'/posts/{post.id}/')
        add_experience(post.author, 10)
    messages.success(request, "设为精华" if post.is_essence else "取消精华")
    return redirect('post_detail', pk=post.id)


@login_required
def report_post(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if request.method == 'POST':
        form = ReportForm(request.POST)
        if form.is_valid():
            report = form.save(commit=False)
            report.reporter = request.user
            report.post = post
            report.save()
            messages.success(request, "举报已提交，管理员将尽快处理。")
    return redirect('post_detail', pk=post.id)


def hot_posts(request):
    posts = Post.objects.annotate(
        _score=F('likes_count') * 2 + F('comments_count') * 3 + F('views_count')
    ).order_by('-_score')[:20]
    return render(request, 'posts/hot.html', {'posts': posts})
