##Onsite Office Roadmap

####Core Functionality

1. User Management
  1. ~~login~~
  2. sign-up 
  3. ~~one user is a member of multiple groups~~
  4. admins can manage users from Onsite Office
  5. access control (ie. admins, editors, users can only access relevant data)
  6. ~~Keep track of user logged in or not.~~
  
2. Library Development
  1. ~~create new and edit libraries~~
  2. ~~create component schemas in libraries~~
  3. ~~delete componentSchemas along with library~~
  
3. Template Development
  1. ~~render templatePage~~
  2. ~~create new and edit templates~~
  3. ~~create templates starting from another template~~
  4. ~~Delete associated components on delete template~~
  
4. Projects
  1. ~~create new and edit projects~~
  2. ~~create projects from template~~
  3. ~~Delete associated components on delete project~~
  
5. Project Page
  1. ~~render page and save data inputs~~
  2. ~~seperate models for each individual component (easier sync logic)~~
  3. ~~save active component on switching to another component~~
  4. ~~save project when using Descriptive Libraries~~
  5. ~~save active component on leaving page~~
  6. ~~copy component~~
  7. ~~Save project as template~~
  8. ~~Notes tab.~~
  
6. Data management
  1. ~~persistent data store using pouchDB~~
  2. ~~couchDB backend~~
  
7. UX
  1. ~~use ng-enter in dialog boxes to "ok" when last input box is focused.~~
  
8. Reports
  1. ~~bring reports and reportPage up to speed~~
  2. ~~download word doc reports~~
  3. ~~Allow user to select multiple components~~
  
9. Settings
   1. Update for user Service
   2. Option to only sync your own projects
   
  
####Functionality Wish List

1. User Management
  1. sign-up
  2. admins can manage users from Onsite Office
  3. access control (ie. admins, editors, users can only access relevant data)

1. Projects
  1. display projects in table format (Office)
  2. allow group admins to specify which fields appear in projects table
  
2. Project Page
  1. component bridges
     1.  Present user with previously used bridges for active component FIRST
	 2.  Allow user to create new and save automatically.  Only 1 Bridge per component pair to streamline the UX.
  2. take pictures and attach to projects and components.
  
 3. Reports
  1. ~~calculate all values up front so they can used anywhere in the report~~
  2. expand available exposed functions
  
  