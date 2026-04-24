import type { ChatMessage, BubbleContext } from "../types/index.js";
import {
  MORE_ICON,
  COPY_ICON,
  EDIT_ICON,
  DELETE_ICON,
} from "../constants/icons.js";
import { setTrustedInnerHTML, type TrustedStaticHTML } from "../utils/trusted-html.js";
import {
  LONG_PRESS_MS,
  EDIT_WINDOW_MS,
  DELETE_WINDOW_MS,
} from "../constants/index.js";

export type { BubbleContext };

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


function dismissAllDropdowns(root: HTMLElement): void {
  root.querySelectorAll(".message-dropdown.open").forEach((el) => {
    el.classList.remove("open");
  });
  root.querySelectorAll(".message-more-btn.active").forEach((el) => {
    el.classList.remove("active");
  });
}


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
    wrapper.replaceChildren();
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

function createBubble(msg: ChatMessage, ctx: BubbleContext, listEl: HTMLElement): HTMLElement {
  const isVisitor = msg.senderRole === "visitor";

  const row = document.createElement("div");
  row.className = `message-row ${isVisitor ? "message-row-user" : "message-row-visitor"}`;
  row.setAttribute("data-id", msg.id);
  row.setAttribute("data-sender-id", msg.senderId);

  const bubble = document.createElement("div");
  const roleClass = isVisitor ? "message-user" : "message-visitor";
  const statusClass = msg.status === "pending" ? "message-pending" : "";
  bubble.className = `message-bubble ${roleClass} ${statusClass}`.trim();

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

  const isOwnMessage = isVisitor && msg.senderId === ctx.visitorId;
  const isActionable = isOwnMessage && msg.status === "sent";

  if (isActionable) {
    const messageAge = Date.now() - new Date(msg.createdAt).getTime();
    const canEdit = messageAge < EDIT_WINDOW_MS;
    const canDelete = messageAge < DELETE_WINDOW_MS;

    const moreBtn = document.createElement("button");
    moreBtn.className = "message-more-btn";
    moreBtn.type = "button";
    setTrustedInnerHTML(moreBtn, MORE_ICON);
    moreBtn.setAttribute("aria-label", "Message options");

    const dropdownAnchor = document.createElement("div");
    dropdownAnchor.className = "message-dropdown-anchor";

    const dropdown = document.createElement("div");
    dropdown.className = "message-dropdown";

    const copyItem = createDropdownItem(COPY_ICON, "Copy", () => {
      navigator.clipboard.writeText(msg.content);
      dropdown.classList.remove("open");
      moreBtn.classList.remove("active");
    });
    dropdown.appendChild(copyItem);

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

    if (isVisitor) {
      row.appendChild(dropdownAnchor);
    } else {
      row.insertBefore(dropdownAnchor, bubble);
    }

    attachLongPress(row, () => {
      dismissAllDropdowns(listEl);
      dropdown.classList.add("open");
      moreBtn.classList.add("active");
    });
  }

  return row;
}

function createDropdownItem(
  iconSvg: TrustedStaticHTML,
  label: string,
  onClick: () => void,
): HTMLElement {
  const item = document.createElement("button");
  item.className = "dropdown-item";
  item.type = "button";

  const iconSpan = document.createElement("span");
  iconSpan.className = "dropdown-item-icon";
  setTrustedInnerHTML(iconSpan, iconSvg);

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;

  item.appendChild(iconSpan);
  item.appendChild(labelSpan);

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return item;
}
