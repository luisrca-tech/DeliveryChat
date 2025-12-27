import { HTTP_STATUS } from "../../lib/http.js";
import { API_ERROR_STATUS_CODE_MAP } from "../constants/httpStatus.js";

export function mapToHttpStatus(
  status: string | number,
): (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] {
  const statusNum = typeof status === "string" ? parseInt(status, 10) : status;
  return (
    API_ERROR_STATUS_CODE_MAP[statusNum] ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}
