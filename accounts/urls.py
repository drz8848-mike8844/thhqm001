from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

urlpatterns = [
    path('login/', auth_views.LoginView.as_view(template_name='accounts/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('register/', views.register, name='register'),
    path('reset/', views.reset_password, name='reset_password'),
    path('profile/', views.profile, name='profile'),
    path('profile/edit/', views.profile_edit, name='profile_edit'),
    path('profile/change-password/', views.change_password, name='change_password'),
    path('verify-email/<str:token>/', views.verify_email, name='verify_email'),
    path('resend-verification/', views.resend_verification_email, name='resend_verification_email'),
    path('password-reset/', views.password_reset_request, name='password_reset_request'),
    path('password-reset/<str:token>/', views.reset_password_confirm, name='reset_password_confirm'),

    # 用户主页
    path('u/<str:username>/', views.user_home, name='user_home'),

    # 私信
    path('messages/', views.inbox, name='inbox'),
    path('messages/<int:pk>/', views.conversation, name='conversation'),
    path('messages/new/<str:username>/', views.start_conversation, name='start_conversation'),

    # 通知
    path('notifications/', views.notifications, name='notifications'),
    path('notifications/<int:pk>/read/', views.mark_notification_read, name='mark_notification_read'),
    path('notifications/read-all/', views.mark_all_notifications_read, name='mark_all_notifications_read'),

    # 关注
    path('follow/<str:username>/', views.follow, name='follow'),
    path('unfollow/<str:username>/', views.unfollow, name='unfollow'),
    path('following/', views.following_list, name='following_list'),
    path('followers/', views.followers_list, name='followers_list'),
]
