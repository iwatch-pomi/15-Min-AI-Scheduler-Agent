import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.events",
          // リフレッシュトークンを受け取るため
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
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
