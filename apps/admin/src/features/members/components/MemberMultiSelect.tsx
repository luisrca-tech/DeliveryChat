import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { useMembersQuery } from "../hooks/useMembersQuery";
import type { OrgMember } from "../types/members.types";

type Props = {
  selected: OrgMember[];
  onChange: (members: OrgMember[]) => void;
  placeholder?: string;
  excludeIds?: string[];
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
};

export function MemberMultiSelect({
  selected,
  onChange,
  placeholder = "Add participants...",
  excludeIds = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMembersQuery();

  const members = (data?.users ?? []).filter((m) => {
    if (excludeIds.includes(m.id)) return false;
    if (m.isAnonymous) return false;
    return true;
  });

  const selectedIds = new Set(selected.map((m) => m.id));

  const toggle = (member: OrgMember) => {
    if (selectedIds.has(member.id)) {
      onChange(selected.filter((m) => m.id !== member.id));
    } else {
      onChange([...selected, member]);
    }
  };

  const remove = (id: string) => {
    onChange(selected.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">{placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or email..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading..." : "No members found."}
              </CommandEmpty>
              <CommandGroup>
                {members.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.name} ${m.email}`}
                    onSelect={() => toggle(m)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${selectedIds.has(m.id) ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{m.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {m.email} · {roleLabels[m.role] ?? m.role}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md"
            >
              {m.name}
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
