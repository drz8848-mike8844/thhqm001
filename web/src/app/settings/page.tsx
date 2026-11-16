import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { ProfileSettingsForm } from "@/components/ProfileSettingsForm";

export const metadata: Metadata = { title: "设置" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/settings");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="section-head">
        <h1 id="settings-title">设置</h1>
        <a className="section-head__more" href={`/u/${profile.username}`}>
          查看我的主页 →
        </a>
      </div>

      <ProfileSettingsForm
        profile={{
          id: profile.id,
          username: profile.username,
          nickname: profile.nickname,
          bio: profile.bio,
          avatar_url: profile.avatar_url,
          level: profile.level,
          xp: profile.xp,
        }}
        email={user?.email ?? null}
      />
    </section>
  );
}
