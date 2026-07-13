import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createApplication,
  updateApplication,
  deleteApplication,
} from "../lib/applications.client";
import type {
  ApplicationDetailResponse,
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from "../types/applications.types";
import { applicationsQueryKeys } from "./useApplicationsQuery";

export function useCreateApplicationMutation() {
  return useMutation({
    mutationFn: (body: CreateApplicationRequest) => createApplication(body),
  });
}

export function useUpdateApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateApplicationRequest;
    }) => updateApplication(id, body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
      queryClient.invalidateQueries({
        queryKey: applicationsQueryKeys.detail(variables.id),
      });
    },
  });
}

/**
 * Toggles a single AI setting (`aiAutoRespond` or `aiDbEnabled`) with an
 * optimistic update against the detail query cache, rolling back on error.
 */
export function useToggleApplicationAiSettingMutation(id: string) {
  const queryClient = useQueryClient();
  const detailKey = applicationsQueryKeys.detail(id);

  return useMutation({
    mutationFn: (body: Pick<UpdateApplicationRequest, "aiAutoRespond" | "aiDbEnabled">) =>
      updateApplication(id, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous =
        queryClient.getQueryData<ApplicationDetailResponse>(detailKey);

      queryClient.setQueryData<ApplicationDetailResponse>(detailKey, (old) =>
        old ? { ...old, application: { ...old.application, ...body } } : old,
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey });
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
    },
  });
}

export function useDeleteApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
    },
  });
}
