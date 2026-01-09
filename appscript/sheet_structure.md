A1: Contact Details
B1: Contact Details
C1: Contact Details
D1: Contact Details
E1: Contact Details
F1: Contact Details
G1: Contact Details
H1: Contact Details
I1: Organization
J1: Organization
K1: Key Opportunity
L1: Assignment
M1: Assignment
N1: Assignment
A2: Title
B2: Given Name(s)
C2: Last Name
D2: Email
E2: Telephone
F2: Mobile
G2: Source
H2: Source Notes
I2: Organization Name
J2: Position/Title
K2: Area of Law
L2: Assigned To
M2: Follow Up Due
N2: Assigned By
A3: Omnia Business Solutions
B3: David
C3: Gava
D3: accounts@omniabs.com.au
E3: 
F3: 0429 966 642
G3: Other
H3: Omnia Business Solutions was active since 2013 and provides expert bookkeeping, payroll, and financial consulting services to help businesses streamline operations and stay financially healthy
David is the Managing Director
2-5 employees

Suite 517 2/8 Brookhollow Ave, Norwest NSW 2153
https://omniabs.com.au/
https://www.linkedin.com/company/omniabs/?originalSubdomain=au
https://www.facebook.com/omniabs
I3: Omnia Business Solutions
J3: Managing Director
K3: Advice
L3: Audrey
M3: 12/16/25
N3: Audrey
A4: DPR Chartered Accountants
B4: Pitronaci
C4: Dom
D4: N/A
E4: 61 296346107
F4: 
G4: Other
H4: DPR Chartered Accountants was active since since 2009 
Dom Pitronaci is the Partner
14-20 employees

1 Maitland Pl, Norwest NSW 2153
-https://dprca.com.au/contact/
https://www.zoominfo.com/p/Dom-Pitronaci/7594459933
I4: DPR Chartered Accountants
J4: Partner
K4: Advice
L4: Audrey
M4: 12/16/25
N4: Audrey
A5: DSM Accounting
B5: Mudely
C5: Raj
D5: info@dsma.com.au
E5: 
F5: (02) 9680 7732
G5: Other
H5: DSM Accounting was  established in 2012
Raj Mudely is the Director and Founder. He is a practicing Chartered Accountant. He has been providing accounting, tax and advisory services for 21 years, to small and medium size businesses. 
Small firm

Suite 17, Hills Corporate Centre 11 Brookhollow Avenue Norwest Business Park, Sydney
https://www.dsma.com.au/
http://linkedin.com/company/dsm-accounting/?originalSubdomain=au
https://www.linkedin.com/in/selvarajen-mudely-1407a346/
I5: DSM Accounting
J5: Director and Founder
K5: Advice
L5: Audrey
M5: 12/16/25
N5: Audrey
A6: HY Accounting
B6: Youssef
C6: Michael
D6: enquiries@hyaccounting.com.au
E6: 61 2 9837 6148
F6: 
G6: Other
H6: HY Accounting has began around late 2017/early 2018. 
Michael is an accomplished CFO specialising in strategic consulting.
9-12 employees

Level 5, 4 Columbia Ct, Bella Vista, NSW, Australia, New South Wales
https://www.hyaccounting.com.au/
https://www.linkedin.com/company/hy-accounting/?originalSubdomain=au
https://www.linkedin.com/in/michael-y/
https://www.facebook.com/hyaccounting/
I6: HY Accounting
J6: Financial Planner and Head of Purpose
K6: Advice
L6: Audrey
M6: 12/16/25
N6: Audrey


Sheet name : "Data"

I want a API project in this apps script like this below (an example from another apps script api project)
// isStudentAllowed
// insertSubmission
// showImages

// OTHER ENDPOINTS:
// getSchoolStartAndEndTime
// getScheduledVideoId

function doGet(request) {
    var action = request.parameter.action;
    var studentId = String(request.parameter.studentId);
    var timestamp = request.parameter.timestamp;
    var folderId = request.parameter.folderId
    var scriptId = request.parameter.scriptId
    var type = request.parameter.type
    var primaryMail = request.parameter.primaryMail
    var secondaryMail = request.parameter.secondaryMail
    var date = request.parameter.date

    switch (action) {
      case "loadBalanceRequest":
        return loadBalanceRequestAPIController(studentId)

      case "isStudentAllowed":
        return isStudentAllowedAPIController(studentId)
      
      case "isStudentAuthorized":
        return isStudentAuthorizedAPIController(studentId)
      
      case "isTeacherAuthorized":
        return isTeacherAuthorizedAPIController(studentId)

      case "insertSubmission":
        return insertSubmissionAPIController(folderId,scriptId,type,timestamp,studentId)

      case "showImages":
        return showImagesAPIController(folderId)

      case "updateGuardianMails":
        return updateGuardianMailsAPIController(studentId, primaryMail, secondaryMail)

      case "getInitData":
        return getInitDataAPIController()

      case "getAssessmentFolder":
        return getAssessmentFolderAPIController(date, type, studentId)
                
      default:
          logMessage("Action is not defined", "doGet - undefined action");
          // Handle unknown action
          return ContentService.createTextOutput(JSON.stringify({
              error: "Unknown action"
          })).setMimeType(ContentService.MimeType.JSON);
    }
}
