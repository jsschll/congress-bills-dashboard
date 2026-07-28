(async function initPoliticiansResultsPage() {
  await bootNav("politicians");

  const addressInput = document.getElementById("address-input");
  const currentAddress = new URLSearchParams(window.location.search)
    .get("address")
    ?.trim();
  if (addressInput && currentAddress) {
    addressInput.value = currentAddress;
  }

  mountAddressLookup({
    formId: "address-form",
    inputId: "address-input",
  });

  mountAddressResultsPage({
    statusId: "address-status",
    resultsId: "address-results",
    queryLabelId: "results-query",
  });
})();
