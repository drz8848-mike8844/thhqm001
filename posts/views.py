# posts/views.py
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden
from django.db.models import Q, Count, F
from django.contrib import messages
from django.core.paginator import Paginator
from .models import Post, Like, Favorite, Comment, CommentLike, Tag, Report
from .forms import PostForm, CommentForm, ReportForm
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
        form = PostForm(request.POST, request.FILES)
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
    return render(request, 'posts/form.html', {'form': form})


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


def share_post(request, pk):
    post = get_object_or_404(Post, pk=pk)
    post.shares_count += 1
    post.save()
    messages.success(request, "已转发（链接已复制）！")
    return redirect('post_detail', pk=post.id)


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
