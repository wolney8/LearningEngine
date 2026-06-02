export type AdminTaskNoticeLevel = "success" | "error";

export type AdminTaskNotice = {
  level: AdminTaskNoticeLevel;
  message: string;
  createdAt: number;
};

const STORAGE_KEY = "lle_admin_task_notices";
export const ADMIN_TASK_NOTICE_EVENT = "lle:admin-task-notice";

function readNoticeQueue(): AdminTaskNotice[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is AdminTaskNotice => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const maybeItem = item as Partial<AdminTaskNotice>;
      return (
        (maybeItem.level === "success" || maybeItem.level === "error") &&
        typeof maybeItem.message === "string" &&
        typeof maybeItem.createdAt === "number"
      );
    });
  } catch {
    return [];
  }
}

function writeNoticeQueue(queue: AdminTaskNotice[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (queue.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage failures; immediate in-page messaging still works.
  }
}

export function enqueueAdminTaskNotice(level: AdminTaskNoticeLevel, message: string) {
  const nextNotice: AdminTaskNotice = {
    level,
    message,
    createdAt: Date.now(),
  };

  const queue = readNoticeQueue();
  queue.push(nextNotice);
  writeNoticeQueue(queue);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_TASK_NOTICE_EVENT));
  }
}

export function consumeNextAdminTaskNotice(): AdminTaskNotice | null {
  const queue = readNoticeQueue();
  if (queue.length === 0) {
    return null;
  }

  const next = queue.shift() ?? null;
  writeNoticeQueue(queue);
  return next;
}
