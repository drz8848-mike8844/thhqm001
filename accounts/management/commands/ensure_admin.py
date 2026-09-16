"""根据 .env 中的 ADMIN_USER / ADMIN_PASS / ADMIN_EMAIL 创建或更新超级管理员。

用法：
    python manage.py ensure_admin

行为（幂等）：
    - 未设置 ADMIN_USER 或 ADMIN_PASS        -> 跳过并提示
    - 管理员不存在                            -> 创建（is_staff/is_superuser=True，设置 email 与密码）
    - 管理员已存在且 ADMIN_RESET_PASSWORD!=true -> 不动账号（防止每次部署覆盖密码）
    - 管理员已存在且 ADMIN_RESET_PASSWORD=true  -> 按 .env 重置密码

相关环境变量（放在项目根目录 .env 中）：
    ADMIN_USER             管理员用户名（必填才创建）
    ADMIN_PASS             管理员密码（必填才创建）
    ADMIN_EMAIL            管理员邮箱（可选，默认 <username>@example.com）
    ADMIN_RESET_PASSWORD   已存在时是否重置密码（可选，默认 false）
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "根据 .env 的 ADMIN_* 配置创建/更新超级管理员（幂等）"

    def handle(self, *args, **options):
        User = get_user_model()

        username = (os.environ.get("ADMIN_USER") or "").strip()
        password = os.environ.get("ADMIN_PASS") or ""
        email = (os.environ.get("ADMIN_EMAIL") or "").strip()
        reset = os.environ.get("ADMIN_RESET_PASSWORD", "").strip().lower() == "true"

        if not username or not password:
            self.stdout.write(
                self.style.WARNING(
                    "未设置 ADMIN_USER/ADMIN_PASS（请在 .env 中配置），跳过管理员创建"
                )
            )
            return

        email = email or f"{username}@example.com"

        user, created = User.objects.get_or_create(username=username)

        if created:
            user.email = email
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"已创建超级管理员：{username}"))
            return

        if reset:
            user.email = email
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"超级管理员 {username} 已存在，已按 .env 重置密码（ADMIN_RESET_PASSWORD=true）"
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"超级管理员 {username} 已存在，未做修改"
                "（如需覆盖密码请设置 ADMIN_RESET_PASSWORD=true）"
            )
        )