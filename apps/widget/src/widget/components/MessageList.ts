import type { ChatMessage } from "../types.js";

// ── SVG Icons (14x14, Lucide-style) ──

const MORE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const EDIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

const DELETE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

// ── Time windows ──

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DELETE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// ── Types ──

export type BubbleContext = {
  visitorId: string | null;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
};

// ── Long-press support ──

const LONG_PRESS_MS = 500;

function attachLongPress(
  el: HTMLElement,
  onLongPress: () => void,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  el.addEventListener(
    "touchstart",
    () => {
      timer = setTimeout(onLongPress, LONG_PRESS_MS);
    },
    { passive: true },
  );

  el.addEventListener(
    "touchend",
    () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    { passive: true },
  );

  el.addEventListener(
    "touchmove",
    () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    { passive: true },
  );
}

// ── Dropdown dismiss helper ──

function dismissAllDropdowns(root: HTMLElement): void {
  root.querySelectorAll(".message-dropdown.open").forEach((el) => {
    el.classList.remove("open");
  });
  root.querySelectorAll(".message-more-btn.active").forEach((el) => {
    el.classList.remove("active");
  });
}

// ── Public API ──

export function createMessageList(
  messages: ChatMessage[],
  ctx: BubbleContext,
): HTMLElement {
  const list = document.createElement("div");
  list.className = "message-list";
  list.setAttribute("role", "log");
  list.setAttribute("aria-live", "polite");

  const fragment = document.createDocumentFragment();
  for (const msg of messages) {
    fragment.appendChild(createBubble(msg, ctx, list));
  }
  list.appendChild(fragment);

  // Dismiss dropdowns on click/tap outside
  list.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".message-more-btn") && !target.closest(".message-dropdown")) {
      dismissAllDropdowns(list);
    }
  });

  list.addEventListener(
    "touchstart",
    (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".message-more-btn") && !target.closest(".message-dropdown")) {
        dismissAllDropdowns(list);
      }
    },
    { passive: true },
  );

  return list;
}

export function appendMessage(
  list: HTMLElement,
  message: ChatMessage,
  ctx: BubbleContext,
): void {
  const typingEl = list.querySelector(".typing-indicator");
  const bubble = createBubble(message, ctx, list);
  if (typingEl) {
    list.insertBefore(bubble, typingEl);
  } else {
    list.appendChild(bubble);
  }
  list.scrollTop = list.scrollHeight;
}

export function updateMessageStatus(
  list: HTMLElement,
  messageId: string,
  newId: string,
  status: "sent" | "failed",
): void {
  const row = list.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;
  row.setAttribute("data-id", newId);
  const bubble = row.querySelector(".message-bubble");
  if (bubble) {
    bubble.classList.remove("message-pending");
    bubble.classList.add(status === "sent" ? "message-sent" : "message-failed");
  }
}

export function updateMessageContent(
  list: HTMLElement,
  messageId: string,
  content: string,
  editedAt?: string | null,
): void {
  const row = list.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;

  const textEl = row.querySelector(".message-text");
  if (textEl) textEl.textContent = content;

  if (editedAt) {
    let metaEl = row.querySelector(".message-meta");
    if (!metaEl) {
      metaEl = document.createElement("span");
      metaEl.className = "message-meta";
      row.querySelector(".message-content-wrapper")?.appendChild(metaEl);
    }
    if (!metaEl.querySelector(".message-edited-label")) {
      const label = document.createElement("span");
      label.className = "message-edited-label";
      label.textContent = "(edited)";
      metaEl.appendChild(label);
    }
  }
}

export function markMessageDeleted(
  list: HTMLElement,
  messageId: string,
): void {
  const row = list.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;

  const bubble = row.querySelector(".message-bubble");
  if (bubble) bubble.classList.add("message-deleted");

  // Remove action trigger
  row.querySelector(".message-dropdown-anchor")?.remove();

  // Replace content
  const wrapper = row.querySelector(".message-content-wrapper");
  if (wrapper) {
    wrapper.innerHTML = "";
    const deletedText = document.createElement("span");
    deletedText.className = "message-deleted-text";
    deletedText.textContent = "This message was deleted";
    wrapper.appendChild(deletedText);
  }
}

export function enterEditMode(
  list: HTMLElement,
  messageId: string,
  currentContent: string,
  onSave: (newContent: string) => void,
  onCancel: () => void,
): void {
  const row = list.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;
  const bubble = row.querySelector(".message-bubble") as HTMLElement | null;
  if (!bubble) return;

  bubble.classList.add("message-editing");

  // Hide the bubble and dropdown anchor entirely
  bubble.style.display = "none";
  const dropdownAnchor = row.querySelector(".message-dropdown-anchor") as HTMLElement | null;
  if (dropdownAnchor) dropdownAnchor.style.display = "none";

  // Create edit form — appended to the row, not inside the bubble
  const editContainer = document.createElement("div");
  editContainer.className = "edit-container";

  const textarea = document.createElement("textarea");
  textarea.className = "edit-input";
  textarea.value = currentContent;
  textarea.rows = 2;

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "edit-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.type = "button";

  const saveBtn = document.createElement("button");
  saveBtn.className = "edit-save";
  saveBtn.textContent = "Save";
  saveBtn.type = "button";

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  editContainer.appendChild(textarea);
  editContainer.appendChild(actions);
  row.appendChild(editContainer);

  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = textarea.value.trim();
      if (trimmed && trimmed !== currentContent) {
        onSave(trimmed);
      } else {
        onCancel();
      }
    }
    if (e.key === "Escape") {
      onCancel();
    }
  });

  saveBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = textarea.value.trim();
    if (trimmed && trimmed !== currentContent) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  });

  cancelBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  });
}

export function exitEditMode(
  list: HTMLElement,
  messageId: string,
  content: string,
  editedAt?: string | null,
): void {
  const row = list.querySelector(`[data-id="${messageId}"]`);
  if (!row) return;
  const bubble = row.querySelector(".message-bubble") as HTMLElement | null;
  if (!bubble) return;

  bubble.classList.remove("message-editing");
  row.querySelector(".edit-container")?.remove();

  // Restore bubble and dropdown
  bubble.style.display = "";
  const dropdownAnchor = row.querySelector(".message-dropdown-anchor") as HTMLElement | null;
  if (dropdownAnchor) dropdownAnchor.style.display = "";

  const textEl = bubble.querySelector(".message-text");
  if (textEl) textEl.textContent = content;

  const contentWrapper = bubble.querySelector(".message-content-wrapper");
  if (editedAt) {
    let metaEl = bubble.querySelector(".message-meta");
    if (!metaEl) {
      metaEl = document.createElement("span");
      metaEl.className = "message-meta";
      contentWrapper?.appendChild(metaEl);
    }
    if (!metaEl.querySelector(".message-edited-label")) {
      const label = document.createElement("span");
      label.className = "message-edited-label";
      label.textContent = "(edited)";
      metaEl.appendChild(label);
    }
  }
}

// ── Private ──

function createBubble(msg: ChatMessage, ctx: BubbleContext, listEl: HTMLElement): HTMLElement {
  const isVisitor = msg.senderRole === "visitor";

  // Row wrapper — full width, hover target for "..."
  const row = document.createElement("div");
  row.className = `message-row ${isVisitor ? "message-row-user" : "message-row-visitor"}`;
  row.setAttribute("data-id", msg.id);
  row.setAttribute("data-sender-id", msg.senderId);

  // Bubble
  const bubble = document.createElement("div");
  const roleClass = isVisitor ? "message-user" : "message-visitor";
  const statusClass = msg.status === "pending" ? "message-pending" : "";
  bubble.className = `message-bubble ${roleClass} ${statusClass}`.trim();

  // Deleted message
  if (msg.isDeleted) {
    bubble.classList.add("message-deleted");
    const wrapper = document.createElement("div");
    wrapper.className = "message-content-wrapper";
    const deletedText = document.createElement("span");
    deletedText.className = "message-deleted-text";
    deletedText.textContent = "This message was deleted";
    wrapper.appendChild(deletedText);
    bubble.appendChild(wrapper);
    row.appendChild(bubble);
    return row;
  }

  // Content wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "message-content-wrapper";

  const textSpan = document.createElement("span");
  textSpan.className = "message-text";
  textSpan.textContent = msg.content;
  wrapper.appendChild(textSpan);

  if (msg.editedAt) {
    const meta = document.createElement("span");
    meta.className = "message-meta";
    const label = document.createElement("span");
    label.className = "message-edited-label";
    label.textContent = "(edited)";
    meta.appendChild(label);
    wrapper.appendChild(meta);
  }

  bubble.appendChild(wrapper);
  row.appendChild(bubble);

  // "..." trigger + dropdown (only for visitor's own sent messages)
  const isOwnMessage = isVisitor && msg.senderId === ctx.visitorId;
  const isActionable = isOwnMessage && msg.status === "sent";

  if (isActionable) {
    const messageAge = Date.now() - new Date(msg.createdAt).getTime();
    const canEdit = messageAge < EDIT_WINDOW_MS;
    const canDelete = messageAge < DELETE_WINDOW_MS;

    // "..." button — lives in the row, beside the bubble
    const moreBtn = document.createElement("button");
    moreBtn.className = "message-more-btn";
    moreBtn.type = "button";
    moreBtn.innerHTML = MORE_ICON;
    moreBtn.setAttribute("aria-label", "Message options");

    // Dropdown menu — anchored to the "..." button
    const dropdownAnchor = document.createElement("div");
    dropdownAnchor.className = "message-dropdown-anchor";

    const dropdown = document.createElement("div");
    dropdown.className = "message-dropdown";

    // Copy
    const copyItem = createDropdownItem(COPY_ICON, "Copy", () => {
      navigator.clipboard.writeText(msg.content);
      dropdown.classList.remove("open");
      moreBtn.classList.remove("active");
    });
    dropdown.appendChild(copyItem);

    // Edit (within 15 min)
    if (canEdit) {
      const editItem = createDropdownItem(EDIT_ICON, "Edit", () => {
        dropdown.classList.remove("open");
        moreBtn.classList.remove("active");
        ctx.onEdit(msg.id, msg.content);
      });
      dropdown.appendChild(editItem);
    }

    // Delete (within 2 days)
    if (canDelete) {
      const deleteItem = createDropdownItem(DELETE_ICON, "Delete", () => {
        dropdown.classList.remove("open");
        moreBtn.classList.remove("active");
        ctx.onDelete(msg.id);
      });
      deleteItem.classList.add("dropdown-item-danger");
      dropdown.appendChild(deleteItem);
    }

    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissAllDropdowns(listEl);
      dropdown.classList.toggle("open");
      moreBtn.classList.toggle("active");
    });

    dropdownAnchor.appendChild(moreBtn);
    dropdownAnchor.appendChild(dropdown);

    // "..." always on the left side of the bubble
    // row-reverse for user msgs: DOM order after bubble = visually left
    // row for visitor msgs: DOM order before bubble = visually left
    if (isVisitor) {
      row.appendChild(dropdownAnchor);
    } else {
      row.insertBefore(dropdownAnchor, bubble);
    }

    // Mobile long-press
    attachLongPress(row, () => {
      dismissAllDropdowns(listEl);
      dropdown.classList.add("open");
      moreBtn.classList.add("active");
    });
  }

  return row;
}

function createDropdownItem(
  iconSvg: string,
  label: string,
  onClick: () => void,
): HTMLElement {
  const item = document.createElement("button");
  item.className = "dropdown-item";
  item.type = "button";
  item.innerHTML = `${iconSvg}<span>${label}</span>`;
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return item;
}
