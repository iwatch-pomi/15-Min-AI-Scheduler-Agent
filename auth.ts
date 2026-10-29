import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          // メインのカレンダーは読むだけ。書き込めるのはこのアプリが作ったカレンダー（AI 専用）だけ
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.events.readonly",
            "https://www.googleapis.com/auth/calendar.app.created",
          ].join(" "),
          // リフレッシュトークンを受け取るため
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  // ログインに失敗したとき（同時に2つのタブでログインしたときなど）は、Auth.js の英語のエラー画面ではなくトップに戻す。
  // トップでは、ほかのタブでログインできていればそのまま使え、できていなければログイン画面に案内を出す
  pages: { error: "/" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.uid = await upsertGoogleUser({
          googleSub: account.providerAccountId,
          email: profile?.email ?? token.email,
          refreshToken: account.refresh_token,
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
