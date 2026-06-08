const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (!envUrl || envUrl === "undefined" || envUrl === "null" || envUrl === "") {
    return "/api";
  }
  return envUrl;
};

export const API_BASE_URL = getApiUrl();
