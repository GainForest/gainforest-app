const TREE_UPLOAD_FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScpHS_-7QTTiHIseqjzvkdbx6jzjenebkaLGXoETNrfit0ZNA/viewform";
const CONTENTSQUARE_UXA_BASE_URL = "https://t.contentsquare.net/uxa";

export const links = {
  manage: {
    trees: "/manage/trees",
    treesUpload: "/manage/trees?mode=upload",
    treesFiltered: (options?: { dataset?: string | null }) => {
      const searchParams = new URLSearchParams();
      if (options?.dataset) searchParams.set("dataset", options.dataset);
      const queryString = searchParams.toString();
      return `/manage/trees${queryString ? `?${queryString}` : ""}`;
    },
  },
  external: {
    treeUploadFeedbackForm: TREE_UPLOAD_FEEDBACK_FORM_URL,
    treeUploadFeedbackFormEmbed: `${TREE_UPLOAD_FEEDBACK_FORM_URL}?embedded=true`,
    contentsquareUxaTag: (tagId: string) =>
      `${CONTENTSQUARE_UXA_BASE_URL}/${encodeURIComponent(tagId)}.js`,
  },
} as const;
