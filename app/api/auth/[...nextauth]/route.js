import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const ADMIN_EMAILS = [
  "tusharneymar8@gmail.com",
  "apaarmsd@gmail.com"
  
]

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      return ADMIN_EMAILS.includes(user.email)
    },

    async session({ session }) {
      session.user.isAdmin = ADMIN_EMAILS.includes(session.user.email)
      return session
    },
  },
})

export { handler as GET, handler as POST }
