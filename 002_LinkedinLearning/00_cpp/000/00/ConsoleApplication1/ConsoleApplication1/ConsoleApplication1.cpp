// ConsoleApplication1.cpp : This file contains the 'main' function. Program execution begins and ends there.
//

#include <iostream>
#include <string>

using namespace std;

auto a = 5;
auto b = 12345678901;
auto c = 3.14f;
auto d = 3.14;
auto e = true;  
auto f = 'd';

int main()
{
    cout << typeid(a).name() << endl;
    cout << typeid(b).name() << endl;
    cout << typeid(c).name() << endl;
    cout << typeid(d).name() << endl;
    cout << typeid(e).name() << endl;
    cout << typeid(f).name() << endl;
    cout << "Hello World!\n";
}


