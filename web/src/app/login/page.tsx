import { redirect } from "next/navigation";

import { getDefaultAuthorizedPath, loadAuthenticatedAppUser } from "@/lib/auth/access";
import { LoginClient } from "./login-client";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await loadAuthenticatedAppUser();
  const params = searchParams ? await searchParams : undefined;
  const nextPath =
    params?.next && params.next.startsWith("/") ? params.next : "/";

  if (user && user.active) {
    redirect(getDefaultAuthorizedPath(user.permissions, user.userType));
  }

  return <LoginClient nextPath={nextPath} />;
}
