// -- copyright
// OpenProject is a project management system.
// Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See doc/COPYRIGHT.rdoc for more details.
// ++

import {Component, ElementRef, OnInit, ViewChild, HostListener} from '@angular/core';
import {ContainHelpers} from 'app/modules/common/focus/contain-helpers';
import {I18nService} from 'app/modules/common/i18n/i18n.service';
import {DynamicBootstrapper} from "app/globals/dynamic-bootstrapper";
import {PathHelperService} from "app/modules/common/path-helper/path-helper.service";
import {HalResourceService} from "app/modules/hal/services/hal-resource.service";
import {WorkPackageResource} from "app/modules/hal/resources/work-package-resource";
import {CollectionResource} from "app/modules/hal/resources/collection-resource";
import {DynamicCssService} from "app/modules/common/dynamic-css/dynamic-css.service";
import {GlobalSearchService} from "app/modules/global_search/global-search.service";
import {CurrentProjectService} from "app/components/projects/current-project.service";
import {NgSelectComponent} from "@ng-select/ng-select";

export const globalSearchSelector = 'global-search-input';

@Component({
  selector: globalSearchSelector,
  templateUrl: './global-search-input.component.html'
})

export class GlobalSearchInputComponent implements OnInit {
  @ViewChild('btn') btn:ElementRef;
  @ViewChild(NgSelectComponent) public ngSelectComponent:NgSelectComponent;

  public searchTerm:string = '';
  public expanded:boolean = false;
  public results:any[];
  public suggestions:any[];
  public mobileSearch:boolean = false;

  private $element:JQuery;

  public text:{ [key:string]:string } = {
    all_projects: this.I18n.t('js.global_search.all_projects'),
    this_project: this.I18n.t('js.global_search.this_project'),
    this_project_and_all_descendants: this.I18n.t('js.global_search.this_project_and_all_descendants'),
    search: this.I18n.t('js.global_search.search') + ' ...'
  };

  constructor(readonly elementRef:ElementRef,
              readonly I18n:I18nService,
              readonly PathHelperService:PathHelperService,
              readonly halResourceService:HalResourceService,
              readonly dynamicCssService:DynamicCssService,
              readonly globalSearchService:GlobalSearchService,
              readonly currentProjectService:CurrentProjectService) {
  }

  private projectScopeTypes = ['all_projects', 'this_project', 'this_project_and_all_descendants'];

  ngOnInit() {
    this.$element = jQuery(this.elementRef.nativeElement);
  }

  // detect if click is outside or inside the element
  @HostListener('click', ['$event'])
  public handleClick(event:JQueryEventObject):void {
    event.stopPropagation();
    event.preventDefault();

    // handle click on search button
    if (ContainHelpers.insideOrSelf(this.btn.nativeElement, event.target)) {
      if (this.isMobile) {
        this.toggleMobileSearch();
        // open ng-select menu on default
        jQuery('.ng-input input').focus();
        this.ngSelectComponent.isOpen = true;
      } else {
        this.submitNonEmptySearch();
      }
    }
  }

  // if window is resized while mobile search is still open close search
  @HostListener('window:resize', ['$event'])
  onResize(event:any) {
    if (event.target.innerWidth > 680 && this.mobileSearch) {
      this.ngSelectComponent.close();
      this.toggleMobileSearch();
    }
  }

  // open or close mobile search
  public toggleMobileSearch() {
    // show / hide DOM elements
    jQuery('.ng-select, #account-nav-right, #account-nav-left, #main-menu-toggle').toggleClass('hidden-for-mobile');
    // set correct classes
    this.mobileSearch = !this.mobileSearch;
    this.expanded = !this.expanded;
  }

  // load selected item
  public onChange($event:any) {
    let selectedOption = $event;
    if (selectedOption.id) {  // item is a work package element
      this.redirectToWp(selectedOption.id);
    } else {                  // item is a 'scope' element
      this.searchInScope(selectedOption.projectScope);
    }
  }

  // load result list for searched term
  public handleUserInput($event:any) {
    this.searchTerm = $event;
    this.globalSearchService.searchTerm = this.searchTerm;

    if (this.searchTerm.length > 0) {
      this.getSearchResult(this.searchTerm);
    }

    this.toggleMenu();
  }

  public toggleMenu() {
    // close menu when input field is empty
    if (this.searchTerm.length > 0) {
      this.ngSelectComponent.isOpen = true;
    } else {
      this.ngSelectComponent.isOpen = false;
    }
  }

  public onFocus() {
    this.expanded = true;
    this.ngSelectComponent.filterValue = this.searchTerm;
  }

  public onFocusOut() {
    if (!this.isMobile) {
      this.expanded = false;
      this.ngSelectComponent.isOpen = false;
    }
  }

  // get work packages result list and append it to suggestions
  private getSearchResult(term:string) {
    this.autocompleteWorkPackages(term).then((values) => {
      this.results = this.suggestions.concat(values.map((wp:any) => {
        return { id: wp.id, subject: wp.subject, status: wp.status.name, statusId: wp.status.idFromLink, $href: wp.$href };
      }));
    });
  }

  public customSearchFn(term:string, item:any):boolean {
    // return all project scope items and all items which contain the search term
    if (item.id === undefined || item.subject.toLowerCase().indexOf(term.toLowerCase()) !== -1) {
      return true;
    } else {
      return false;
    }
  }

  private autocompleteWorkPackages(query:string):Promise<(any)[]> {
    this.dynamicCssService.requireHighlighting();

    // hide empty dropdown (only on desktop) while spinner is shown
    if (!this.isMobile) {
      setTimeout( () => this.$element.find('.ng-dropdown-panel').hide());
    }
    this.$element.find('.ui-autocomplete--loading').show();

    let idOnly:boolean = false;

    if (query.match(/^#\d+$/)) {
      query = query.replace(/^#/, '');
      idOnly = true;
    }

    let href:string = this.PathHelperService.api.v3.wpBySubjectOrId(query, idOnly);

    this.addSuggestions();

    return this.halResourceService
      .get<CollectionResource<WorkPackageResource>>(href)
      .toPromise()
      .then((collection) => {
        this.hideSpinner();
        return collection.elements;
      }).catch(() => {
        this.hideSpinner();
      });
  }

  // set the possible 'search in scope' options for the current project path
  private addSuggestions() {
    this.suggestions = [];
    // add all options when searching within a project
    // otherwise search in 'all projects'
    if (this.currentProjectService.path) {
      this.suggestions.push('this_project_and_all_descendants');
      this.suggestions.push('this_project');
    }
    this.suggestions.push('all_projects');

    this.suggestions = this.suggestions.map((suggestion:string) => {
      return { projectScope: suggestion, subject: this.text[suggestion] }
    });
  }

  private searchInScope(scope:string) {
    console.log("Search in scope! ", scope);
    switch (scope) {
      case 'all_projects': {
        let forcePageLoad = false;
        if (this.globalSearchService.projectScope !== 'all') {
          forcePageLoad = true;
          this.globalSearchService.resultsHidden = true;
        }
        this.globalSearchService.projectScope = 'all';
        this.submitNonEmptySearch(forcePageLoad);
        break;
      }
      case 'this_project': {
        this.globalSearchService.projectScope = 'current_project';
        this.submitNonEmptySearch();
        break;
      }
      case 'this_project_and_all_descendants': {
        this.globalSearchService.projectScope = '';
        this.submitNonEmptySearch();
        break;
      }
      default: {
        // do nothing
      }
    }
  }

  public submitNonEmptySearch(forcePageLoad:boolean = false) {
    if (this.searchValue.length > 0) {
      // Work package results can update without page reload.
      if (!forcePageLoad &&
          this.globalSearchService.isAfterSearch() &&
          this.globalSearchService.currentTab === 'work_packages') {
        window.history
          .replaceState({},
            `${I18n.t('global_search.search')}: ${this.searchValue}`,
            this.globalSearchService.searchPath());

        return;
      }
      this.globalSearchService.submitSearch();
    }
  }

  private redirectToWp(id:string) {
    window.location = this.PathHelperService.workPackagePath(id) as unknown as Location;
  }

  private hideSpinner():void {
    this.$element.find('.ui-autocomplete--loading').hide();
    this.$element.find('.ng-dropdown-panel').show();
  }

  private get searchValue() {
    return this.searchTerm ? this.searchTerm : '';
  }

  private get isMobile():boolean {
    return (window.innerWidth < 680);
  }
}

DynamicBootstrapper.register({
  selector: globalSearchSelector, cls: GlobalSearchInputComponent
});
