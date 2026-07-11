import { Plus, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import type { ToolInputSchema, ToolPropertyType } from "../types/dataTools.types";

const PARAM_TYPES: ToolPropertyType[] = ["string", "number", "integer", "boolean"];

export type ParamRow = {
  name: string;
  type: ToolPropertyType;
  required: boolean;
};

export function schemaToParamRows(schema: ToolInputSchema): ParamRow[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type,
    required: required.has(name),
  }));
}

export function paramRowsToSchema(rows: ParamRow[]): ToolInputSchema {
  const properties: ToolInputSchema["properties"] = {};
  const required: string[] = [];
  for (const row of rows) {
    if (!row.name.trim()) continue;
    properties[row.name.trim()] = { type: row.type };
    if (row.required) required.push(row.name.trim());
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export type ParamSchemaBuilderProps = {
  rows: ParamRow[];
  onChange: (rows: ParamRow[]) => void;
};

/**
 * Guided builder for a tool's flat input schema — the model only ever sees
 * scalar params, so this avoids exposing raw JSON Schema by default.
 */
export function ParamSchemaBuilder({ rows, onChange }: ParamSchemaBuilderProps) {
  const addRow = () => {
    onChange([...rows, { name: "", type: "string", required: false }]);
  };

  const updateRow = (index: number, patch: Partial<ParamRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex items-end gap-2 rounded-md border p-2"
            >
              <div className="grid flex-1 gap-1">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="productId"
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid w-32 gap-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={row.type}
                  onValueChange={(value) =>
                    updateRow(index, { type: value as ToolPropertyType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id={`param_required_${index}`}
                  checked={row.required}
                  onCheckedChange={(checked) =>
                    updateRow(index, { required: checked === true })
                  }
                />
                <Label htmlFor={`param_required_${index}`} className="text-xs">
                  Required
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`Remove param ${row.name || index + 1}`}
                onClick={() => removeRow(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        Add parameter
      </Button>
    </div>
  );
}
