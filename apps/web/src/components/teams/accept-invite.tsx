"use client";

import { CircleAlert, CircleCheck, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/session";
import { useAcceptInvite } from "@/lib/teams";
import { cn } from "@/lib/utils";

export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("teams");
  const session = useSession();
  const accept = useAcceptInvite();
  const [started, setStarted] = useState(false);

  if (session.isPending) return null;
  if (!session.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>{t("acceptSignIn")}</p>
        <Link href="/auth/login" className={cn(buttonVariants({ variant: "primary" }))}>
          {t("signIn")}
        </Link>
      </div>
    );
  }
  if (accept.isSuccess) {
    return (
      <div className="flex flex-col items-start gap-3" data-invite-accepted>
        <p className="flex items-center gap-2 font-medium">
          <CircleCheck className="size-5 text-success-strong" aria-hidden />
          {t("joined", { name: accept.data.name })}
        </p>
        <Link
          href={`/dashboard/teams/${accept.data.id}`}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          {t("openTeam")}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{t("acceptBody")}</p>
      {accept.isError ? (
        <p className="flex items-center gap-2 text-danger-strong" role="alert">
          <CircleAlert className="size-4" aria-hidden />
          {accept.error.message}
        </p>
      ) : null}
      <Button
        icon={<UserCheck />}
        variant="primary"
        loading={accept.isPending}
        disabled={started && accept.isError}
        onClick={() => {
          setStarted(true);
          accept.mutate(token);
        }}
        data-invite-accept
      >
        {t("accept")}
      </Button>
    </div>
  );
}
