import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function HomePage() {
  const cookieStore = await cookies()
  const hasRefreshToken = cookieStore.has("refresh_token")

  if (hasRefreshToken) {
    redirect("/chat")
  } else {
    redirect("/auth/login")
  }
}
