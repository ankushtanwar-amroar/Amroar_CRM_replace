// Simulation of Use Case 6: Bulk Lead Insert → GET Leads by Status → FOR LOOP → Update computed “priority”

// Simulate a database of leads
let leads = [];

// Function to generate test data
function generateTestData() {
  // Bulk insert 100 Leads with Status=New
  for (let i = 1; i <= 100; i++) {
    leads.push({
      Id: `Lead${i}`,
      Status: 'New',
      LastName: `LastName${i}`,
      Description: ''
    });
  }
  // Bulk insert 100 Leads with Status=Working
  for (let i = 101; i <= 200; i++) {
    leads.push({
      Id: `Lead${i}`,
      Status: 'Working',
      LastName: `LastName${i}`,
      Description: ''
    });
  }
}

// Trigger: Lead → After Insert (bulk insert)
function simulateBulkInsert() {
  generateTestData();
  console.log(`Bulk inserted ${leads.length} leads.`);
}

// Flow steps
function processLeads() {
  // 1. Assignment: runTag = "RUN-" + TODAY()
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const runTag = `RUN-${today}`;

  // 2. Get Records: Leads where Status == "New"
  const newLeads = leads.filter(lead => lead.Status === 'New');
  console.log(`Retrieved ${newLeads.length} leads with Status='New'.`);

  // 3. For Loop (each lead):
  const leadsToUpdate = [];
  newLeads.forEach(lead => {
    // priority = (LEN(lead.LastName) * 10) + 5
    const priority = (lead.LastName.length * 10) + 5;
    // lead.Description = runTag + " Priority=" + priority
    lead.Description = `${runTag} Priority=${priority}`;
    // Add to update collection
    leadsToUpdate.push(lead);
  });

  // 4. Update Records: bulk update all leads collected
  // In simulation, just log the updates
  console.log(`Bulk updating ${leadsToUpdate.length} leads.`);
  leadsToUpdate.forEach(lead => {
    console.log(`Updated Lead ${lead.Id}: Description = "${lead.Description}"`);
  });

  // Verification
  const updatedNewLeads = leads.filter(lead => lead.Status === 'New' && lead.Description.includes(runTag));
  const untouchedWorkingLeads = leads.filter(lead => lead.Status === 'Working' && lead.Description === '');
  console.log(`\nVerification:`);
  console.log(`- Updated "New" leads: ${updatedNewLeads.length}`);
  console.log(`- Untouched "Working" leads: ${untouchedWorkingLeads.length}`);
  console.log(`- Total leads: ${leads.length}`);
}

// Run the simulation
simulateBulkInsert();
processLeads();
