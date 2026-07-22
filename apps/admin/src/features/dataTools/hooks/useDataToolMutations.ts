import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createDataTool,
  deleteDataTool,
  setDataToolEnabled,
  testDataTool,
  updateDataTool,
} from "../lib/dataTools.client";
import type { DataToolBody } from "../types/dataTools.types";
import { dataToolsQueryKeys } from "./useDataToolsQuery";

export function useCreateDataToolMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: DataToolBody) => createDataTool(applicationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataToolsQueryKeys.list(applicationId),
      });
    },
  });
}

export function useUpdateDataToolMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ toolId, body }: { toolId: string; body: DataToolBody }) =>
      updateDataTool(applicationId, toolId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataToolsQueryKeys.list(applicationId),
      });
    },
  });
}

export function useDeleteDataToolMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => deleteDataTool(applicationId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataToolsQueryKeys.list(applicationId),
      });
    },
  });
}

export function useTestDataToolMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      toolId,
      params,
    }: {
      toolId: string;
      params: Record<string, unknown>;
    }) => testDataTool(applicationId, toolId, params),
    onSuccess: (result) => {
      // A successful test bumps `lastTestedAt` server-side, which unlocks Enable.
      if (result.ok) {
        queryClient.invalidateQueries({
          queryKey: dataToolsQueryKeys.list(applicationId),
        });
      }
    },
  });
}

export function useSetDataToolEnabledMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ toolId, enabled }: { toolId: string; enabled: boolean }) =>
      setDataToolEnabled(applicationId, toolId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataToolsQueryKeys.list(applicationId),
      });
    },
  });
}
