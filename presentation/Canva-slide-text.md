# ReviseLab Canva presentation — historical snapshot

This text and the PPTX beside it are snapshots from the initial repository upload. Read the [live Canva design](https://www.canva.com/design/DAHbiTsaupo/-0EGqUAW3z29u5YZoE0DTA/edit) for current content and page numbers.

GroupPresentation
Mobile Applications Design and Development
Group Number
To be confirmed
Group Members
To be confirmed
INT4074 (202627-T1)
Presentation Outline
Introduction and PurposeEducational E-Learning Design PrinciplesFunctions and FeaturesSpecial FeaturesGroup Work ExperienceConclusionApp Demo Video Q&A
Introductionand Purpose
Part ITarget Learners · Platform · Development Tools
PART I   INTRODUCTION AND PURPOSE
ReviseLab
A mobile app for IELTS Academic writing practice
Can learners take what they learnfrom one draft into the next?
A learner can follow an AI suggestion and improve one draftwhile still being unsure how to tackle the same problem next time.
IELTS Academic Writing asks candidates to describe visual information and develop an argument (IELTS, n.d.).
PART I   INTRODUCTION AND PURPOSE
What learners should be able to do
01   Understand the feedback
Explain what needs to change and why.
02   Revise their own writing
Make the change in their own words.
03   Apply the skill on a new task
Use the same approach without a prompt from the tutor.
EducationalE-LearningDesign Principles
Part II
PART II   LEARNING DESIGN
A prompt when planning stalls
Scaffolding
Task 2 example
The learner tried to move on beforegiving a reason. The tutor returnedto Ideas and asked a follow-up question.
The learner still has to supply the reason.
(Wood et al., 1976)
PART II   LEARNING DESIGN
Feedback learners can act on
Formative feedback
What is missing?
The draft introduces the chart butdoes not summarise its main trends.
What can the learner do?
Add an overview sentence intheir own words.
(Shute, 2008)
PART II   LEARNING DESIGN
The same skill on a new essay question
Transfer of learning
First prompt   Smartphones at school
New prompt   Computers in class
Same skill: use a specific example to support a reason.
Both prompts are answered in the mobile app. The new prompt has no hints.
Next   How the practice works in ReviseLab
(National Research Council, 2000, Chapter 3)
In PE, students could use slow-motion phone video to seewhen the ball leaves their hand and adjust the next shot.
In geography, students could overlay flood-risk zones andbus routes on a digital map to spot stops a flood could cut off.
Illustrative classroom examples
Functionsand Features
Part IIIA. Frontend UI Logic  ·  B. Backend Data & APIsUI Design · App Screenshots · Source Code
Part III A
MIT App Inventor Blocks
Frontend UI Logic
Place the App screen here.Mark the user action.
App Screen Capture
Place the matching event and logic blocks here.Show what happens after the user action.
BackendData & APIs
Part III B
Backend Project Structure
Part III B · ReviseLab
Part III B · Backend Data & APIs
Where the Topics Come From
Load Task 1 locally
FileT1 reads the bundled Task 1 CSV.
Fetch Task 2 online
GotText parses the Google Sheets CSV and refreshes the list.
Use the local fallback
FileT2 reads the local Task 2 list if the header check fails.
Part III B · Backend Data & APIs
From Essay to Estimate
Build the JSON body
JsonObjectEncode packages the task, topic and essay.
Send the request
Web1.PostText sends the JSON body to the Worker.
Read the estimate
The App displays the band returned by the Worker.
Part III B · Backend Data & APIs
How the Worker Routes Requests
How the Worker Builds a Score
Part III B · Backend Data & APIs
Part III B · Backend Data & APIs
How the Worker Calls the AI API
Where the API Keys Are Stored
Part III B · Backend Data & APIs
Part III B · Backend Data & APIs
From Photo to Editable Text
Part III B · Backend Data & APIs
AI Tutor, Hints & Writing Plan
SpecialFeatures
Part IV
Part IV · Special Features
Guided Revision
Open a scoring issue
See the original sentence and a suggested next step.
Submit a revision
The App sends the original, issue and revision to /check.
Read the feedback
The result says whether the change fixed the issue and can suggest a hint.
Part IV · Special Features
Targeted Practice
Part VDivision of Labour · Problems · Solutions
Group WorkExperience
Conclusion
Strengths and Weaknesses · Future ImprovementsLessons from Development
Part VI
App DemoVideo
Part VII
3 min max
Questions& Answers
Part VIII
資源頁面
發現使用 Canva 簡報進行展示的魔力和樂趣。在簡報模式中按下下列按鍵！
B 代表模糊
C 代表五彩紙屑
D 代表擊鼓
O 代表泡沫
Q 代表安靜
X 代表關閉
選取 0-9 之間的任意數字來設定計時器
資源頁面
對簡報直播沒興趣嗎？別擔心！錄製你的 Canva 簡報，讓觀眾就能自行決定觀看的步調。
01
點擊畫面右上角的三個點，然後選擇「簡報並錄製」。
04
開始錄製，如有需要請在兩次錄影之間按下暫停。
02
點擊「前往錄製工作室」，即可在裡面選擇視訊簡報的視訊和音訊來源。
05
完成後，下載 MP4 檔案格式的 Canva 簡報，或是取得「談話簡報」的連結並與他人分享。
03
請自由選擇「無攝影機」選項，然後僅錄製你的聲音。
06
你也可以在編輯器中錄製影片！前往「上傳」並點擊「錄製自己」。
