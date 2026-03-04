import { useState, useCallback } from "react";

type FormValues = {
  requestsPerSecond: number | null;
  requestsPerMinute: number | null;
  requestsPerHour: number | null;
};

type UseRateLimitsFormOptions = {
  initialValues: FormValues;
  onSubmit: (values: FormValues) => void;
};

export function useRateLimitsForm({
  initialValues,
  onSubmit,
}: UseRateLimitsFormOptions) {
  const [values, setValues] = useState<FormValues>(initialValues);

  const setFieldValue = useCallback(
    <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(values);
    },
    [onSubmit, values]
  );

  return {
    values,
    setFieldValue,
    handleSubmit,
  };
}
