import { redirect } from "next/navigation";

/** Alias for `/register` (bookmark-friendly). */
export default function SignupRedirectPage() {
  redirect("/register");
}
