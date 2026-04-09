import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account basics. Password change and 2FA will connect here."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Card className="max-w-xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Your sign-in email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                readOnly
                value={user?.email ?? ""}
                className="bg-muted/40"
              />
            </div>
          </CardContent>
        </Card>
        <Card className="max-w-xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
            <CardDescription>
              Optional TOTP 2FA and session list — planned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Password change, email verification, and Turnstile will hook into
              this section.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
