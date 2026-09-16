from django import forms
from .models import Post, Comment, Report


class PostForm(forms.ModelForm):
    tags_input = forms.CharField(
        label="标签 (用逗号分隔，最多5个)",
        required=False,
        widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': '例如：东方,推荐,音乐'}),
    )

    class Meta:
        model = Post
        fields = ['title', 'content', 'image', 'link']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'form-control'}),
            'content': forms.Textarea(attrs={'rows': 8, 'class': 'form-control'}),
            'link': forms.URLInput(attrs={'class': 'form-control'}),
        }

    def save(self, commit=True):
        post = super().save(commit=False)
        if commit:
            post.save()
            self._save_tags(post)
        return post

    def _save_tags(self, post):
        from .models import Tag
        raw = self.cleaned_data.get('tags_input', '')
        names = [t.strip() for t in raw.replace('，', ',').split(',') if t.strip()]
        names = names[:5]
        tags = []
        for name in names:
            tag, _ = Tag.objects.get_or_create(name=name[:30])
            tags.append(tag)
        post.tags.set(tags)


class CommentForm(forms.Form):
    content = forms.CharField(
        label="评论内容",
        widget=forms.Textarea(attrs={'rows': 3, 'class': 'form-control', 'placeholder': '写下你的评论... (支持 @提及用户)'}),
    )


class ReportForm(forms.ModelForm):
    class Meta:
        model = Report
        fields = ['reason', 'description']
        widgets = {
            'reason': forms.Select(attrs={'class': 'form-select'}),
            'description': forms.Textarea(attrs={'rows': 3, 'class': 'form-control', 'placeholder': '补充说明（选填）'}),
        }


class SearchForm(forms.Form):
    ORDER_CHOICES = (
        ('new', '最新发布'),
        ('hot', '最热门'),
        ('liked', '最多点赞'),
        ('discussed', '最多讨论'),
    )
    q = forms.CharField(required=False, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': '搜索标题或内容...'}))
    tag = forms.CharField(required=False, widget=forms.HiddenInput())
    author = forms.CharField(required=False, widget=forms.HiddenInput())
    order = forms.ChoiceField(choices=ORDER_CHOICES, required=False, widget=forms.Select(attrs={'class': 'form-select form-select-sm'}))
