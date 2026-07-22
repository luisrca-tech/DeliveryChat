import { useMutation, useQueryClient } from "@tanstack/react-query";
import { putDataSource } from "../lib/dataTools.client";
import type { DataSourceBody } from "../types/dataTools.types";
import { dataSourceQueryKeys } from "./useDataSourceQuery";

export function usePutDataSourceMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: DataSourceBody) => putDataSource(applicationId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(dataSourceQueryKeys.detail(applicationId), data);
    },
  });
}
