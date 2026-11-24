"use client";

import {
  Download,
  Folder,
  FolderPlus,
  LogIn,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { CloudExportButtons } from "@/components/cloud/cloud-actions";
import { CloudConnections } from "@/components/cloud/cloud-connections";
import { EmptyState } from "@/components/ui/blocks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toast } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
import {
  useLibraryFiles,
  useLibraryFolders,
  useLibraryMutations,
  useLibraryQuota,
  type LibraryFile,
} from "@/lib/library";
import { useSession } from "@/lib/session";
import { useTeams } from "@/lib/teams";
import { cn, formatBytes } from "@/lib/utils";

type View = { kind: "folder"; id: string | null } | { kind: "trash" };

function FileRow({
  file,
  trash,
  folders,
  actions,
  readOnly,
  canDelete,
}: {
  file: LibraryFile;
  trash: boolean;
  folders: { id: string; name: string }[];
  actions: ReturnType<typeof useLibraryMutations>;
  readOnly: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("library");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(file.name);
  const [tags, setTags] = useState(file.tags.join(", "));
  const teamParam = actions.teamId ? `?team_id=${actions.teamId}` : "";

  const save = () => {
    actions.updateFile.mutate(
      {
        id: file.id,
        name: name.trim() || file.name,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      { onSuccess: () => setEditing(false), onError: toastError },
    );
  };

  return (
    <li className="flex flex-col gap-2 p-3" data-library-file>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-48 flex-1"
            aria-label={t("rename")}
            maxLength={255}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
        )}
        <span className="text-xs text-muted tabular-nums">{formatBytes(file.size_bytes)}</span>
        <span className="text-xs text-muted">
          {format.dateTime(new Date(file.updated_at), { dateStyle: "medium" })}
        </span>
        {trash ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.restoreFile.mutate(file.id, { onError: toastError })}
            >
              <RotateCcw aria-hidden />
              {t("restore")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.deleteForever.mutate(file.id, { onError: toastError })}
            >
              <Trash2 aria-hidden />
              {t("deleteForever")}
            </Button>
          </>
        ) : (
          <>
            <CloudExportButtons source={{ library_file_id: file.id }} />
            <a
              href={`/api/v1/library/files/${file.id}/download${teamParam}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Download aria-hidden />
              {t("download")}
            </a>
            {readOnly ? null : (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("edit")}
                onClick={() => setEditing(!editing)}
                data-library-edit
              >
                <Pencil aria-hidden />
              </Button>
            )}
            {canDelete ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("moveToTrash")}
                onClick={() => actions.trashFile.mutate(file.id, { onError: toastError })}
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {!editing && file.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {file.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t("tagsPlaceholder")}
            aria-label={t("tags")}
            className="min-w-48 flex-1"
          />
          <Select
            aria-label={t("moveTo")}
            value={file.folder_id ?? ""}
            onChange={(event) =>
              actions.updateFile.mutate(
                { id: file.id, folder_id: event.target.value || null, move: true },
                { onError: toastError },
              )
            }
          >
            <option value="">{t("rootFolder")}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </Select>
          <Button
            icon={<Save />}
            size="sm"
            variant="solid"
            onClick={save}
            loading={actions.updateFile.isPending}
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function LibraryPage() {
  const t = useTranslations("library");
  const cloudT = useTranslations("cloud");
  const session = useSession();
  const signedIn = Boolean(session.data);
  const teams = useTeams(signedIn);
  const params = useSearchParams();
  const [teamId, setTeamId] = useState<string | null>(params.get("team"));
  const [view, setView] = useState<View>({ kind: "folder", id: null });
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [folderName, setFolderName] = useState("");
  const form = useTranslations("form");
  const [folderError, setFolderError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const trash = view.kind === "trash";
  const folderId = view.kind === "folder" ? view.id : null;
  const files = useLibraryFiles({ teamId, folderId, q: search.trim(), tag, trash }, signedIn);
  const folders = useLibraryFolders(signedIn, teamId);
  const quota = useLibraryQuota(signedIn, teamId);
  const actions = useLibraryMutations(teamId);
  const activeTeam = teams.data?.find((team) => team.id === teamId);
  const readOnly = activeTeam?.role === "viewer";
  const canDelete = !activeTeam || activeTeam.role === "owner" || activeTeam.role === "admin";

  if (session.isPending) return <Skeleton className="h-60 w-full" />;
  if (!session.data) {
    return (
      <EmptyState
        icon={LogIn}
        title={t("signInTitle")}
        body={t("signInBody")}
        action={
          <Link href="/auth/login" className={cn(buttonVariants({ variant: "primary" }))}>
            {t("signIn")}
          </Link>
        }
      />
    );
  }

  const allTags = [...new Set((files.data ?? []).flatMap((file) => file.tags))].sort();
  const ratio = quota.data ? quota.data.used_bytes / quota.data.limit_bytes : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]" data-library>
      <aside className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("space")}
          <Select
            value={teamId ?? ""}
            onChange={(event) => {
              setTeamId(event.target.value || null);
              setView({ kind: "folder", id: null });
              setTag("");
            }}
            data-library-space
          >
            <option value="">{t("personal")}</option>
            {(teams.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </label>
        <nav aria-label={t("folders")} className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setView({ kind: "folder", id: null })}
            aria-current={view.kind === "folder" && view.id === null ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm",
              view.kind === "folder" && view.id === null
                ? "bg-primary-subtle text-primary"
                : "hover:bg-surface-muted",
            )}
          >
            <Folder className="size-4" aria-hidden />
            {t("allFiles")}
          </button>
          {(folders.data ?? []).map((folder) => (
            <div key={folder.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => setView({ kind: "folder", id: folder.id })}
                aria-current={view.kind === "folder" && view.id === folder.id ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-start text-sm",
                  view.kind === "folder" && view.id === folder.id
                    ? "bg-primary-subtle text-primary"
                    : "hover:bg-surface-muted",
                )}
              >
                <Folder className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                aria-label={t("deleteFolder")}
                className="px-2 text-muted opacity-0 group-hover:opacity-100 hover:text-danger-strong focus:opacity-100"
                onClick={() =>
                  actions.deleteFolder.mutate(folder.id, {
                    onSuccess: () => {
                      if (view.kind === "folder" && view.id === folder.id)
                        setView({ kind: "folder", id: null });
                    },
                    onError: toastError,
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setView({ kind: "trash" })}
            aria-current={trash ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm",
              trash ? "bg-primary-subtle text-primary" : "hover:bg-surface-muted",
            )}
            data-library-trash
          >
            <Trash2 className="size-4" aria-hidden />
            {t("trash")}
          </button>
        </nav>
        <form
          hidden={readOnly}
          className="flex items-start gap-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const name = folderName.trim();
            if (!name) {
              setFolderError(form("required"));
              return;
            }
            setFolderError(null);
            actions.createFolder.mutate(
              { name, parent_id: null },
              {
                onSuccess: () => {
                  setFolderName("");
                  toast.success(t("folderCreated", { name }));
                },
                onError: toastError,
              },
            );
          }}
        >
          <Field label={t("newFolder")} error={folderError} className="flex-1">
            {(props) => (
              <Input
                id={props.id}
                aria-describedby={props.describedBy}
                invalid={props.invalid}
                icon={<FolderPlus />}
                enterKeyHint="done"
                autoComplete="off"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t("folderPlaceholder")}
                maxLength={120}
              />
            )}
          </Field>
          <Button
            type="submit"
            size="md"
            variant="outline"
            icon={<FolderPlus />}
            loading={actions.createFolder.isPending}
            className="mt-[1.65rem]"
          >
            {t("createFolder")}
          </Button>
        </form>
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <h3 className="text-sm font-medium">{cloudT("title")}</h3>
          <CloudConnections />
        </div>
        {quota.data ? (
          <div
            className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-xs"
            data-library-quota
          >
            <div className="flex justify-between">
              <span className="font-medium">{t("storage")}</span>
              <span className="text-muted tabular-nums" dir="ltr">
                {formatBytes(quota.data.used_bytes)} / {formatBytes(quota.data.limit_bytes)}
              </span>
            </div>
            <Progress value={ratio} label={t("storage")} tone={ratio > 0.9 ? "danger" : "brand"} />
            <p className="text-muted">{t("trashNote", { days: quota.data.trash_days })}</p>
          </div>
        ) : null}
      </aside>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="ps-9"
            />
          </div>
          {trash ? (
            <Button
              variant="outline"
              disabled={!files.data?.length}
              onClick={() => actions.emptyTrash.mutate(undefined, { onError: toastError })}
            >
              <Trash2 aria-hidden />
              {t("emptyTrash")}
            </Button>
          ) : (
            <>
              <input
                ref={picker}
                type="file"
                className="hidden"
                multiple
                onChange={(event) => {
                  for (const file of Array.from(event.target.files ?? [])) {
                    actions.upload.mutate({ file, folderId }, { onError: toastError });
                  }
                  event.target.value = "";
                }}
                data-library-upload
              />
              <Button
                variant="primary"
                disabled={readOnly}
                onClick={() => picker.current?.click()}
                loading={actions.upload.isPending}
              >
                <Upload aria-hidden />
                {t("upload")}
              </Button>
            </>
          )}
        </div>
        {allTags.length ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("tags")}>
            {allTags.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={tag === entry}
                onClick={() => setTag(tag === entry ? "" : entry)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  tag === entry
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-border text-muted",
                )}
              >
                {entry}
              </button>
            ))}
          </div>
        ) : null}
        {files.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : files.data && files.data.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border bg-surface">
            {files.data.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                trash={trash}
                folders={folders.data ?? []}
                actions={actions}
                readOnly={readOnly}
                canDelete={canDelete}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={trash ? Trash2 : Folder}
            title={trash ? t("trashEmpty") : t("emptyTitle")}
            body={trash ? undefined : t("emptyBody")}
          />
        )}
      </section>
    </div>
  );
}
