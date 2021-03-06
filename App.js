import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  WebView,
  Dimensions,
  Button,
  Image,
  YellowBox,
  AsyncStorage,
  FlatList,
  ScrollView
} from 'react-native';
import {GiftedChat, Actions, Bubble, SystemMessage} from 'react-native-gifted-chat';
import CustomActions from './CustomActions';
import CustomView from './CustomView';
import { createStackNavigator } from 'react-navigation';
import ImagePicker from 'react-native-image-picker'
import * as Progress from 'react-native-progress';
import geolib from 'geolib';
import { Table, TableWrapper, Row, Rows, Col, Cols, Cell } from 'react-native-table-component';

YellowBox.ignoreWarnings(['Warning: isMounted(...) is deprecated', 'Module RCTImageLoader']);

const openrice_data = require('./openrice_data.json');
const districts_list = require('./districts_list.json')
const choice_list = require('./choice_list.json')
const av = require('./exps6086_HB133235C07_19_4b_WEB.jpg')
const state_get_district = 1
//const state_fetch_result = 2 changed to method
const state_get_next_choice = 3
const state_finish_choose = 5
const state_processing = 10
const state_choose_calories = 11
const state_set_calories = 12
const option_state = 0
var nlp = require('compromise')

class HomeScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      messages: [],
      typingText: null,
      target: null,
      PicturePath: "",
      lat: null,
      lng: null
    };

    this._isMounted = false;
    this.onSend = this.onSend.bind(this);
    this.onReceive = this.onReceive.bind(this);
    this.renderCustomActions = this.renderCustomActions.bind(this);
    this.renderBubble = this.renderBubble.bind(this);
    this.renderSystemMessage = this.renderSystemMessage.bind(this);
    this.renderFooter = this.renderFooter.bind(this);
    this.renderCustomView = this.renderCustomView.bind(this);
    this.onLocationReceive = this.onLocationReceive.bind(this);
    this.message_state = 0;
    this.prev_state = 0;
    this.calories = 0;
    this.gram = 0;
    this.foodamount = 0;
    this.foodname = "";
    this.foodunit = "";
    this.foodtime = null;

  }

  initChoose(){
    this.position = 0;
    this.blacklist_cuisine = [];
    this.whitelist_cuisine = [];
    this.districts = [];
    this.prev_position = [];
    this.choice = "";
    this.maxprice = 801.5;
    this.distance = 99;
    this.latlngdistance = 0;
  }

  componentWillMount() {
    this._isMounted = true;
    this.message_state = 1;

    this.setState(() => {
      return {
        messages: require('./data/messages.js')
      };
    });

    navigator.geolocation.getCurrentPosition( (position) => {
      this.setState({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        error: null,
      });
    },
    (error) => this.setState({ error: error.message }),
    { 
      enableHighAccuracy: true, 
      timeout: 60000000, 
      maximumAge: 1000 
    });

    global.date = (new Date()).getDate().toString()
    AsyncStorage.getItem("date").then((value) => {
      if (value != global.date || value == null){
        global.consumed = 0
        global.foodlist = []
      }
      else{
        AsyncStorage.getItem("consumed").then((value) => {
          global.consumed = parseInt(value)
        }).done();
        AsyncStorage.getItem("foodlist").then((value) => {
          if (value != null){
            global.foodlist = JSON.parse(value)
          }
          else{
            global.foodlist = []
          }
        }).done();
      }
    }).done()    
    AsyncStorage.getItem("target").then((value) => {
      if (value != null){
        global.target = parseInt(value)
        global.hasTarget = true
      }
      else{
        global.target = 0
        global.hasTarget = false
      }
    }).done()

    this.initChoose();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  componentDidmount(){
    this.props.navigation.setParams({ title: 'your content' })
  }

  static navigationOptions = ({ navigation }) => ({
    title: 'WhereToEat ChatBot',
    headerStyle: { backgroundColor: '#FFF' },
  }); 

  fetchResult(){
    for (var i = this.position; i < openrice_data.length; i++) {
      let districts_flag = false
      for (let d in this.districts){
        if (this.districts[d] == openrice_data[i].district.toLowerCase())
          districts_flag = true
      }
      if (this.whitelist_cuisine.length > 0){
        if (!this.in(this.whitelist_cuisine, openrice_data[i].cuisine))
          continue
      }
      if (!districts_flag)
        continue
      if (this.in(this.blacklist_cuisine, openrice_data[i].cuisine))
        continue;
      if (openrice_data[i].mtr != null){
        if (openrice_data[i].mtr.includes("-"))
          if (this.distance <= parseInt(openrice_data[i].mtr.split("-")[0]))
            continue;
        if (!openrice_data[i].mtr.includes("-") && this.distance != 99)
          continue;
      }
      else{
        if (this.distance != 99)
          continue
      }
      if (this.maxprice <= openrice_data[i].price.slice(1))
        continue;

      if (this.state.lat != null && openrice_data[i].location != null && this.latlngdistance != 0){
        if (geolib.getDistance( { latitude: this.state.lat, longitude: this.state.lng }, { latitude: openrice_data[i].location.latitude, longitude: openrice_data[i].location.longitude}) > this.latlngdistance)
          continue
      }
      break
    }
    //restart state_fetch_result
    if (i >= openrice_data.length){
      this.answerOutput("No resturant available :(\nRestarting search");
      setTimeout(() => {
        this.message_state = state_get_district;
        this.reaskQuestion()
        
        this.initChoose()
        this.showTyping()
      }, 1000);
    }
    else{
      this.position = i + 1;
      this.display(i)
      this.message_state = state_get_next_choice;
      
    }      
  }

  finishChoose(){
    // display result
    this.answerOutput('You have chosen the following resturant: ')
      setTimeout(() => {
        this.answerOutputImg(openrice_data[this.position-1].name, openrice_data[this.position-1].pic)
        setTimeout(() => {
          this.onLocationReceive(this.position - 1, openrice_data[this.position - 1].address)
          setTimeout(() => {
            this.answerOutput(openrice_data[this.position - 1].url)
            setTimeout(() => {
              let quota = global.target - global.consumed
              if (quota < 0)
                quota = 0
              if (global.consumed / global.target > 0.5)
                this.answerOutput('You have intake quota of ' + quota + " kcal\nMind your diet!")
              else
                this.answerOutput('You have intake quota of ' + quota + " kcal\nFeel free to eat!")
              setTimeout(() => {
                this.answerOutput('Search Finished, please let me know if you want to restart the search! :)')
              }, 1000);
            }, 1000); 
          }, 1000);
        }, 1000);
     }, 1000);
  }

  reaskQuestion(){
    setTimeout(() => {
      switch(this.message_state) {
        case state_get_district:
          this.answerOutput('In which district you are looking for a resturant?')
          break

        case state_get_next_choice:
          this.display(this.position-1)
          break

        case state_finish_choose:
          this.answerOutput('Search Finished, please let me know if you want to restart the search! :)')
          break

        case state_choose_calories:
          this.answerOutput("How many grams did you consume?")
          break
        case state_processing: //should not re-enter
          this.answerOutput("I am working... Wait a sec...")
          break
        case state_set_calories:
          this.answerOutput("Please input the Calorie Target:")
          break
        default:
          this.answerOutput("Something went wrong!")
          break
      }
    }, 1000);
  }
  onSend(messages = []) {
    this.setState((previousState) => {
      return {
        messages: GiftedChat.append(previousState.messages, messages),
      };
    });
    nlp_input = nlp(messages[0].text.toLowerCase())
    if(this.message_state != state_choose_calories && this.message_state != state_processing){
      if (nlp_input.has("(set|setup|make) (calorie|kcal|calories) target")){
        if (nlp_input.match('#Value').out('array').length > 0 ){
          this.answerOutput("I set your Calorie Target to" + nlp_input.values().toNumber().out().toString()+" kcal\nLet's stay healthy together :)")
          AsyncStorage.setItem('target', nlp_input.values().toNumber().out().toString());
          global.target = nlp_input.values().toNumber().out().toString()
          if (global.target != 0)
            global.hasTarget = true
          this.reaskQuestion()
          return
        }
        else{
          this.prev_state = this.message_state
          this.message_state = state_set_calories
        }
      }
    }
    
    if (messages.length > 0) {
      switch(this.message_state) {
        case state_get_district:
          //this.answerOutput('In which district you are looking for a resturant?')

          for (let key in districts_list.districts){
            for (let k2 in districts_list.districts[key]){
              if (nlp_input.has(districts_list.districts[key][k2])){
                this.districts[this.districts.length] = key
                break
              }
            }
          }
          if (this.districts.length>0){
            let out = ""
            for (let d in this.districts){
              out+=this.districts[d]+", "
            }
            out = out.slice(0, -2); //remove last 2 char
            this.answerOutput("You have chosen: "+out)

            //change state
            this.fetchResult()
            this.message_state = state_get_next_choice
          }
          else{
            this.answerOutput('I don\'t understand your district!')
          }
          break
            
        case state_get_next_choice:
          if (nlp_input.has("(pass|not|no)")){
            this.prev_position[this.prev_position.length] = this.position - 1;
            this.fetchResult()         
          }


          else if (nlp_input.has("(previous|last)")){
            if (this.in(messages[0].text.toLowerCase().split(" "), choice_list.choices.pass)){
              this.prev_position[this.prev_position.length] = this.position - 1;
              this.fetchResult()
            }
          }

          else if (nlp_input.has("dislike")){
            this.prev_position[this.prev_position.length] = this.position - 1;
            this.blacklist_cuisine[this.blacklist_cuisine.length] = messages[0].text.toLowerCase().split("dislike")[1].slice(1)
            this.answerOutput("I dislike " + messages[0].text.toLowerCase().split("dislike")[1].slice(1) + " too!")
            this.fetchResult()
          }

          else if (nlp_input.has("like")){
            this.prev_position[this.prev_position.length] = this.position - 1;
            this.whitelist_cuisine[this.whitelist_cuisine.length] = messages[0].text.toLowerCase().split("like")[1].slice(1)
            this.answerOutput("I like " + messages[0].text.toLowerCase().split("like")[1].slice(1) + " too!")
            //this.onReceive(this.whitelist_cuisine)
            this.fetchResult()
          }

          else if (nlp_input.has("(good|nice|yes)")){
            this.answerOutput('Smart choice!')
            this.message_state = state_finish_choose
            this.finishChoose()
          }

          else if (nlp_input.has('(expensive|cost)')){
            this.answerOutput('I know it\'s expensive!')
            this.maxprice = parseFloat(openrice_data[this.position - 1].price.slice(1));
            this.fetchResult()
          }

          else if (nlp_input.has("(far)")){
            this.answerOutput("I agree that's a bit far!")
            if (nlp_input.has("(mtr)")){
              if (openrice_data[this.position - 1].mtr != null)
                if (openrice_data[this.position - 1].mtr.includes("-")){
                  this.distance = parseInt(openrice_data[this.position - 1].mtr.split("-")[0])
                }
            }
            else{
              if (this.state.lat != null && openrice_data[this.position - 1].location != null){
                this.latlngdistance = geolib.getDistance(
                    { latitude: this.state.lat, longitude: this.state.lng },
                    { latitude: openrice_data[this.position - 1].location.latitude, longitude: openrice_data[this.position - 1].location.longitude}
                  )
              }
            }
            this.fetchResult()
          }

          else if (nlp_input.has("(near)")){
            if (openrice_data[this.position - 1].mtr != null)
              if (openrice_data[this.position - 1].mtr.includes("-")){
                this.distance = parseInt(openrice_data[this.position - 1].mtr.split("-")[0]) + 3
              }
            this.fetchResult()
          }
          else{
            this.answerOutput("I am not quite understand what you said.")
            this.reaskQuestion()
          }
          break

        case state_finish_choose:
          if (nlp_input.has("(yes|ok|redo|re-do|go ahead|start|again)")){
            this.message_state = state_get_district
            this.initChoose()
          }
          this.reaskQuestion()
          break

        case state_choose_calories:
          if (nlp_input.has("(no|wrong|not)")){
            this.answerOutput("It's seems like a wrong guess from me. You can upload another photo at anytime!")
            this.reaskQuestion()
          }
          else if (isNaN(parseInt(nlp_input.values().toNumber().out())))
            this.answerOutput("Sorry I don\'t understand. Please re-enter the amount you consumed.")
          else{
            this.answerOutput("You have consumed " + Math.round(parseInt(nlp_input.values().toNumber().out()) / this.gram * this.calories) + " calories.")
            //add to global
            if (global.date != (new Date()).getDate().toString()){
              global.date = (new Date()).getDate().toString()
              global.consumed = 0
            }
            global.consumed += Math.round(parseInt(messages[0].text) / this.gram * this.calories);

            this.foodamount = parseInt(nlp_input.values().toNumber().out())

            let quota = global.target - global.consumed
            if (quota < 0)
              quota = 0
            if (global.consumed / global.target > 0.5)
              this.answerOutput('You have intake quota of ' + quota + " kcal\nMind your diet!")
            else
              this.answerOutput('You have intake quota of ' + quota + " kcal\nFeel free to eat!")
            
            AsyncStorage.setItem('consumed', global.consumed.toString());
            AsyncStorage.setItem('date', global.date);
            this.message_state = this.prev_state

            global.foodlist.push({"time": this.foodtime, "name": this.foodname, "calorieper1": this.calories, "amount":this.foodamount.toString()+this.foodunit, "totalcal": Math.round(parseInt(messages[0].text) / this.gram * this.calories).toString()+"kcal"})
            AsyncStorage.setItem('foodlist', JSON.stringify(global.foodlist));
            this.reaskQuestion()
          }
          break
        case state_processing:
          this.answerOutput("I am working... Wait a sec...")
          break
        case state_set_calories:
          if (nlp_input.match('#Value').out('array').length > 0 ){
            AsyncStorage.setItem('target', nlp_input.values().toNumber().out().toString());
            global.target = nlp_input.values().toNumber().out().toString()
            if (global.target != 0)
              global.hasTarget = true
            this.message_state = this.prev_state
            this.answerOutput("I helped you to set your Calorie Target to "+nlp_input.values().toNumber().out().toString()+" kcal")
            this.reaskQuestion()
          }
          else{
            this.answerOutput("Please input the Calorie Target:")
          }
          
          
          break
        default:
          this.answerOutput("Something went wrong!")
          break
      }
    }
  }
  //For output Img
  answerOutputImg(output, source) {
      this.setState((previousState) => {
        return {
          typingText: 'ChatBot is typing...'
        };
      });
    
    setTimeout(() => {
      this.onReceiveImg(output, source)
      this.setState((previousState) => {
        return {
          typingText: null
        };
      });
    }, 1000);
  }
  //For output message
  answerOutput(output) {
      this.setState((previousState) => {
        return {
          typingText: 'ChatBot is typing...'
        };
      });
    

    setTimeout(() => {
      this.onReceive(output)
      this.setState((previousState) => {
        return {
          typingText: null
        };
      });
    }, 1000);
  }

  showTyping(){
    this.setState((previousState) => {
      return {
        typingText: 'Chat Bot is typing...'
      };
    });
  }
    
  //For output Img
  answerOutputImg(output, source) {
      this.setState((previousState) => {
        return {
          typingText: 'Chat Bot is typing...'
        };
      });

    setTimeout(() => {
      this.onReceiveImg(output, source)
      this.setState((previousState) => {
        return {
          typingText: null
        };
      });
    }, 1000);
  }

  //For output message
  answerOutput(output) {
      this.setState((previousState) => {
        return {
          typingText: 'Chat Bot is typing...'
        };
      });

    setTimeout(() => {
      this.onReceive(output)
      this.setState((previousState) => {
        return {
          typingText: null
        };
      });
    }, 1000);
  }

  in(sublist, list){
    for (var i = 0; i < sublist.length; i++){
      for (var j = 0; j < list.length; j++){
        if (sublist[i].toLowerCase() == list[j].toLowerCase())
          return true;
      }
    }
    return false;
  }

  handleClick(){
    if (this.message_state == state_processing || this.message_state == state_choose_calories){
      this.answerOutput("Cannot choose image now.")
      return;
    }
    ImagePicker.showImagePicker(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      }
      else if (response.error) {
        console.log('ImagePicker Error: ', response.error);
      }
      else if (response.customButton) {
        console.log('User tapped custom button: ', response.customButton);
      }
      else {
        let source = { uri: response.uri };

        this.setState({
          uploaded: true,
          PicturePath: response.path
        });

        this.prev_state = this.message_state
        this.message_state = state_processing
        this.onImageSend("file://" + this.state.PicturePath)

        var data = new FormData();
        data.append('file', {
          uri: "file://" + this.state.PicturePath, 
          name: 'food.jpg', 
          type: 'image/jpg' 
        });

        const config = {
          method: "POST",
          headers:{
            'Accept': 'text/plain',
            'Content-Type': 'multipart/form-data;'
          },
          body: data
        }
        this.answerOutput('Processing request...\nThis may take a few minutes.')

        fetch('http://ir-api.ironsout.com:8080/cgi-bin/upload/upload.cgi', config)
          .then((responseData) => {
            return responseData.text()
          }).then((text) => { 
            var result_list = text.split(" ")
            // this.answerOutput(result_list[5].split("\n")[0])
            if (parseFloat(result_list[5].split("\n")[0]) < 0.5){
              this.answerOutput('Sorry I could not recognise that.') 
              this.message_state = this.prev_state
              this.reaskQuestion()
            }
            else{
              this.answerOutput("It is " + result_list[1].replace("_"," ") + "\nContaining " + result_list[2] + " calories per " + result_list[3].replace ( /[^\d.]/g, '' )+" "+result_list[3].replace ( /[0-9.,]/g, '' )+ "\nHow many "+result_list[3].replace ( /[0-9.]/g, '' )+" did you consume?")
              this.calories = parseInt(result_list[2])
              this.gram = parseInt(result_list[3].slice(0, -2))
              this.message_state = state_choose_calories
              this.foodunit = result_list[3].replace ( /[0-9.,]/g, '' )
              this.foodname = result_list[1].replace("_"," ")
              let date = (new Date())
              this.foodtime = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds()
            }
          })
          .catch(err => { 
            this.answerOutput('Invalid image. Try another one :)') 
            this.message_state = this.prev_state
            this.reaskQuestion()
          })
      }
    });
  }

  display(pos){
    var text = ""
    for (var i = 0; i < openrice_data[pos].cuisine.length; i++){
      text += openrice_data[pos].cuisine[i];
      text += ', '
    }
    text = text.slice(0, -2); //remove last 2 char
    this.answerOutputImg(openrice_data[pos].name, openrice_data[pos].pic)
    setTimeout(() => {
      this.answerOutput('Is the resturant you are looking for called ' + openrice_data[pos].name + '?');
      setTimeout(() => {
        if (openrice_data[pos].mtr != null)
          this.answerOutput('You can get there by ' + openrice_data[pos].mtr);
        setTimeout(() => {
          
            if (openrice_data[pos].cuisine.length > 1 ){
              this.answerOutput("Cuisine keywords are: " + text);
            }
            else{
              this.answerOutput("Cuisine keyword is: " + text);
            }
          setTimeout(() => {
            this.answerOutput('You can choose to accept or reject it! If you choose to reject, better let me know what\'s wrong with this restaurant!')
          }, 1000);
        }, 1000);
      }, 1000);
    
   }, 1000); 
  }

  onReceive(text) {
    this.setState((previousState) => {
      return {
        messages: GiftedChat.append(previousState.messages, {
          _id: Math.round(Math.random() * 1000000),
          text: text,
          createdAt: new Date(),
          user: {
            _id: 2,
            name: 'Chat Bot',
            // avatar: av,
          },
        }),
      };
    });
  }
  onReceiveImg(text,source) {
    this.setState((previousState) => {
      return {
        messages: GiftedChat.append(previousState.messages, {
          _id: Math.round(Math.random() * 1000000),
          text: text,
          image: source,
          createdAt: new Date(),
          user: {
            _id: 2,
            name: 'Chat Bot',
            // avatar: 'https://facebook.github.io/react/img/logo_og.png',
          },
        }),
      };
    });
  }
  onImageSend(source){
    this.setState((previousState) => {
      return {
        messages: GiftedChat.append(previousState.messages, {
          _id: Math.round(Math.random() * 1000000),
          text: '',
          image: source,
          createdAt: new Date(),
          user: {
            _id: 1,
            name: 'Developer',
            // avatar: 'https://facebook.github.io/react/img/logo_og.png',
          },
        }),
      };
    });
  }

  onLocationReceive(pos, out){
    this.setState((previousState) => {
      return {
        messages: GiftedChat.append(previousState.messages, {
          _id: Math.round(Math.random() * 1000000),
          text: out,
          createdAt: new Date(),
          user: {
            _id: 2,
            name: 'Chat Bot',
            // avatar: 'https://facebook.github.io/react/img/logo_og.png',
          },
          location: {
            latitude: openrice_data[pos].location.latitude,
            longitude: openrice_data[pos].location.longitude
          }
        }),
      };
    });    
  }

  renderCustomActions(props) {
    if (Platform.OS === 'ios') {
      return (
        <CustomActions
          {...props}
        />  
      );
    }
    const options = {
      'Food consultant': (props) => {
        option_state = 1
        if (option_state == 1){
          this.handleClick();
        }
      },
      'Calorie Meter': (props) => {
        if (option_state == 0)
          this.props.navigation.navigate('First')
      },
      'Cancel': () => {
        option_state = 0
      },
    };
    return (
      <Actions
        {...props}
        options={options}
      />
    );
  }
//
  renderBubble(props) {
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          left: {
            backgroundColor: '#f0f0f0',
          }
        }}
      />
    );
  }

  renderSystemMessage(props) {
    return (
      <SystemMessage
        {...props}
        containerStyle={{
          marginBottom: 15,
        }}
        textStyle={{
          fontSize: 14,
        }}
      />
    );
  }

  renderCustomView(props) {
    return (
      <CustomView
        {...props}
      />
    );
  }

  renderFooter(props) {
    if (this.state.typingText) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            {this.state.typingText}
          </Text>
        </View>
      );
    }
    return null;
  }

  render() {
    return (
      <GiftedChat
        messages={this.state.messages}
        onSend={this.onSend}
        // loadEarlier={this.state.loadEarlier}
        // onLoadEarlier={this.onLoadEarlier}
        // isLoadingEarlier={this.state.isLoadingEarlier}
        user={{
          _id: 1, // sent messages should have same user._id
        }}

        renderActions={this.renderCustomActions}
        renderBubble={this.renderBubble}
        renderSystemMessage={this.renderSystemMessage}
        renderCustomView={this.renderCustomView}
        renderFooter={this.renderFooter}
      />
    );
  }
}
//

const styles = StyleSheet.create({
  footerContainer: {
    marginTop: 5,
    marginLeft: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#aaa',
  },
  firstText: {
    fontFamily: 'Cochin',
    fontSize: 20,
    color: 'black'
  },
  firstView: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20
  },
  noTargetText: {
    fontFamily: 'Cochin',
    fontSize: 15,
    marginTop: 10
  },


  container: { flex: 1, padding: 16},
    head: { height: 40, backgroundColor: '#f1f8ff' },
    text: { margin: 6 }
});

var options = {
  title: 'Select Photo',
  storageOptions: {
    skipBackup: true,
    path: 'images'
  }
};

class FirstScreen extends React.Component{
  static navigationOptions = ({ navigation }) => ({
    title: 'Calorie Meter',
    headerStyle: { backgroundColor: '#FFF' },
  }); 
  constructor(props) {
    super(props);
    result = [];
    let items = global.foodlist
    for(let i=0; i < items.length; i++){
        result.push([items[i].time, items[i].name, items[i].amount, items[i].totalcal])
    }
    this.state = {
      tableHead: ['Time', 'Food', 'Consumed', 'Calories'],
      tableData: result
    }
  }

  render(){
    const state = this.state;

    return(
      <ScrollView>
        <View style={styles.firstView}>
          <Text style={styles.firstText}>You have consumed {global.consumed.toString()} kcal today</Text>
          {global.hasTarget ? <Text style={styles.firstText}>You can only consume {global.target.toString()} kcal daily</Text> : null}
          { global.hasTarget ? null : <Text style={styles.noTargetText}>Set your calorie target!</Text> }
          <Progress.Circle style={{marginTop: 50}} progress={global.consumed / global.target} size={300} thickness={10} showsText={true} indeterminate={global.hasTarget ? false : true}/>
          <Text style={styles.firstText}> </Text>
          { global.foodlist.length>0 ? <Text style={styles.firstText}>Today's Food List</Text> : <Text style={styles.firstText}>Haven't eat today? Use Food Consultant!</Text> }
        </View>
        { global.foodlist.length>0 ?
        <View style={styles.container}>
          
          <Table borderStyle={{borderWidth: 2, borderColor: '#c8e1ff'}}>
            <Row data={state.tableHead} style={styles.head} textStyle={styles.text}/>
            <Rows data={state.tableData} textStyle={styles.text}/>
          </Table>
        </View>
        : null}
      </ScrollView>  
    )
  }
  
}
//

export default createStackNavigator(
  {
    Home: HomeScreen,
    First: FirstScreen
  }, {
    initialRouteName: 'Home'
  }, {
    navigationOptions: {
      headerTintColor: '#0F0'
    }
  }
);