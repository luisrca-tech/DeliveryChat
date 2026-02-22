import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createApiKey,
  revokeApiKey,
  regenerateApiKey,
} from "../lib/api-keys.client";
import type {
  CreateApiKeyRequest,
  RegenerateApiKeyRequest,
} from "../types/api-keys.types";
import { apiKeysQueryKeys } from "./useApiKeysQuery";
import { applicationsQueryKeys } from "./useApplicationsQuery";

export function useCreateApiKeyMutation(applicationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateApiKeyRequest) =>
      createApiKey(applicationId!, body),
    onSuccess: () => {
      if (applicationId) {
        queryClient.invalidateQueries({
          queryKey: apiKeysQueryKeys.list(applicationId),
        });
      }
      queryClient.invalidateQueries({ queryKey: applicationsQueryKeys.all() });
    },
  });
}

export function useRevokeApiKeyMutation(applicationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onSuccess: () => {
      if (applicationId) {
        queryClient.invalidateQueries({
          queryKey: apiKeysQueryKeys.list(applicationId),
        });
      }
    },
  });
}

export function useRegenerateApiKeyMutation(applicationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      keyId,
      body,
    }: {
      keyId: string;
      body?: RegenerateApiKeyRequest;
    }) => regenerateApiKey(keyId, body ?? {}),
    onSuccess: () => {
      if (applicationId) {
        queryClient.invalidateQueries({
          queryKey: apiKeysQueryKeys.list(applicationId),
        });
      }
    },
  });
}
