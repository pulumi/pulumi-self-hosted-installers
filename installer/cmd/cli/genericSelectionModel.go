package cli

import (
	"log"
	"sort"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
)

type GenericSelectionModel struct {
	title        string
	status       string
	items        map[string]string
	list         list.Model
	selectedItem string
}

func NewGenericSelectionModel(title, status string, items map[string]string, selectedItem string) GenericSelectionModel {
	var listItems []list.Item
	keys := make([]string, 0, len(items))
	selectedIndex := 0
	for k := range items {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for i, k := range keys {
		v := items[k]
		listItems = append(listItems, item{title: k, description: v})
		if k == selectedItem {
			selectedIndex = i
		}
	}
	l := list.New(listItems, list.NewDefaultDelegate(), 80, 20)
	l.Title = title
	l.Select(selectedIndex)

	log.Printf("Title: %s, Status: %s, Items: %v", title, status, items)

	return GenericSelectionModel{
		title:        title,
		status:       status,
		items:        items,
		list:         l,
		selectedItem: selectedItem,
	}
}

func (m GenericSelectionModel) Init() tea.Cmd {
	return nil
}

type item struct {
	title       string
	description string
}

func (i item) Title() string       { return i.title }
func (i item) Description() string { return i.description }
func (i item) FilterValue() string { return i.title }

func (m *GenericSelectionModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		log.Printf("Key pressed: %s", msg.String())
		switch msg.String() {
		case "q":
			log.Println("Quit key pressed")
			return m, tea.Quit
		case "enter", " ":
			log.Println("Enter or Space key pressed")
			if m.list.SelectedItem() != nil {
				log.Println("Item selected")
				if selectedItem, ok := m.list.SelectedItem().(item); ok {
					log.Printf("Selected item type assertion successful: %v", selectedItem)
					m.selectedItem = selectedItem.title
					log.Printf("Selected item: %s", m.selectedItem)
					return m, tea.Quit
				} else {
					log.Println("Item type assertion failed")
				}
			} else {
				log.Println("No item selected")
			}
			return m, nil
		case "down", "j":
			log.Println("Cursor moved down")
			m.list, _ = m.list.Update(msg)
		case "up", "k":
			log.Println("Cursor moved up")
			m.list, _ = m.list.Update(msg)
		default:
			m.list, _ = m.list.Update(msg)
		}
	}
	return m, nil
}

func (m GenericSelectionModel) View() string {
	return m.list.View()
}
