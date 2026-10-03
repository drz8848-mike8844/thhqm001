# posts/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.post_list, name='post_list'),
    path('new/', views.post_create, name='post_create'),
    path('upload-image/', views.upload_editor_image, name='upload_editor_image'),
    path('import-docx/', views.import_docx, name='import_docx'),
    path('hot/', views.hot_posts, name='hot_posts'),
    path('tag/<str:tag>/', views.posts_by_tag, name='posts_by_tag'),
    path('<int:pk>/', views.post_detail, name='post_detail'),
    path('<int:pk>/edit/', views.post_edit, name='post_edit'),
    path('<int:pk>/delete/', views.post_delete, name='post_delete'),
    path('<int:pk>/like/', views.toggle_like, name='toggle_like'),
    path('<int:pk>/favorite/', views.toggle_favorite, name='toggle_favorite'),
    path('<int:pk>/comment/', views.add_comment, name='add_comment'),
    path('<int:pk>/report/', views.report_post, name='report_post'),
    path('<int:pk>/pin/', views.toggle_pin, name='toggle_pin'),
    path('<int:pk>/essence/', views.toggle_essence, name='toggle_essence'),
    path('comment/<int:pk>/delete/', views.delete_comment, name='delete_comment'),
    path('comment/<int:pk>/like/', views.toggle_comment_like, name='toggle_comment_like'),
    path('my-favorites/', views.favorites_list, name='favorites'),
]
