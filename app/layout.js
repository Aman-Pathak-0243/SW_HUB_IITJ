import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import Loader from "@/loader/Loader"
import Providers from "./providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata = {
  title: "Student Affairs-IIT JAMMU",
  description: "Student Affairs website of IIT JAMMU",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* ✅ Auth Context available to entire app */}
        <Providers>
          <Loader>{children}</Loader>
        </Providers>
      </body>
    </html>
  )
}
