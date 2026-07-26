(async function initPoliticiansResultsPage() {
  await bootNav("politicians");
  mountAddressResultsPage({
    statusId: "address-status",
    resultsId: "address-results",
    queryLabelId: "results-query",
  });
})();
