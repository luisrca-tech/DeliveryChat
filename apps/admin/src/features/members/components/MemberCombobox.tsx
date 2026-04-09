import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
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
  value: string | null;
  onSelect: (member: OrgMember | null) => void;
  placeholder?: string;
  excludeIds?: string[];
  filterRole?: ("super_admin" | "admin" | "operator")[];
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
};

export function MemberCombobox({
  value,
  onSelect,
  placeholder = "Select a member...",
  excludeIds = [],
  filterRole,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMembersQuery();

  const members = (data?.users ?? []).filter((m) => {
    if (excludeIds.includes(m.id)) return false;
    if (filterRole && !filterRole.includes(m.role)) return false;
    if (m.isAnonymous) return false;
    return true;
  });

  const selectedMember = members.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedMember ? (
            <span className="truncate">
              {selectedMember.name}{" "}
              <span className="text-muted-foreground text-xs">
                ({roleLabels[selectedMember.role] ?? selectedMember.role})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
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
                  onSelect={() => {
                    onSelect(m.id === value ? null : m);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${m.id === value ? "opacity-100" : "opacity-0"}`}
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
  );
}
