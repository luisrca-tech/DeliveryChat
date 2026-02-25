import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createApplication,
  updateApplication,
  deleteApplication,
} from "../lib/applications.client";
import type {
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from "../types/applications.types";
import { applicationsQueryKeys } from "./useApplicationsQuery";

export function useCreateApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateApplicationRequest) => createApplication(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
    },
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

export function useDeleteApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
    },
  });
}
